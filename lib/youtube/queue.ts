import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  DEFAULT_DAILY_POST_LIMIT,
  DEFAULT_MIN_VERIFY_AGE_HOURS,
  YOUTUBE_STATUSES,
  readPositiveIntEnv,
  type YoutubeEventType,
  type YoutubeReplyStatus,
} from "./queue-schema";
import type { ImportCandidate, LegacyRecord } from "./import";
import { legacyStatusFor } from "./import";

/**
 * Every read and write against the three youtube_reply_* tables.
 *
 * All of it runs through the service-role client, because those tables are
 * RLS-on-with-no-policy: there is no browser-reachable path to them at all.
 * The admin gate lives in the route handlers, exactly as it does for the
 * notice review queue.
 */

/** The columns the admin UI needs. Chosen explicitly -- no select("*"). */
const QUEUE_COLUMNS = `
  id, batch_id, spreadsheet_row, youtube_comment_id, parent_comment_id,
  video_id, video_title, channel_title, source_url, author_name, original_text,
  source_type, topic, score, confidence, reply_status,
  general_reply, kmate_reply, use_kmate, best_choice,
  final_draft, edited_draft, automation_action,
  status, decided_at, is_legacy, legacy_source,
  posted_reply_id, api_accepted_at, verified_at, last_verified_at,
  removed_detected_at, attempt_count, last_attempt_at, last_error,
  created_at, updated_at
`;

export interface QueueRow {
  id: string;
  batch_id: string;
  spreadsheet_row: number | null;
  youtube_comment_id: string;
  parent_comment_id: string | null;
  video_id: string | null;
  video_title: string | null;
  channel_title: string | null;
  source_url: string | null;
  author_name: string | null;
  original_text: string | null;
  source_type: string | null;
  topic: string | null;
  score: number | null;
  confidence: string | null;
  reply_status: string | null;
  general_reply: string | null;
  kmate_reply: string | null;
  use_kmate: boolean | null;
  best_choice: string | null;
  final_draft: string | null;
  edited_draft: string | null;
  automation_action: string | null;
  status: YoutubeReplyStatus;
  decided_at: string | null;
  is_legacy: boolean;
  legacy_source: string | null;
  posted_reply_id: string | null;
  api_accepted_at: string | null;
  verified_at: string | null;
  last_verified_at: string | null;
  removed_detected_at: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatchRow {
  id: string;
  label: string;
  source_filename: string | null;
  kind: string;
  imported_at: string;
  total_rows: number;
  eligible_rows: number;
  imported_rows: number;
  skipped_rows: number;
  already_known_rows: number;
}

export function dailyPostLimit(): number {
  return readPositiveIntEnv(process.env.YOUTUBE_DAILY_POST_LIMIT, DEFAULT_DAILY_POST_LIMIT);
}

export function minVerifyAgeHours(): number {
  return readPositiveIntEnv(
    process.env.YOUTUBE_MIN_VERIFY_AGE_HOURS,
    DEFAULT_MIN_VERIFY_AGE_HOURS
  );
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export interface EventInput {
  queueId: string;
  eventType: YoutubeEventType;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId?: string | null;
  youtubeReplyId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Appends one audit row.
 *
 * Deliberately never throws: losing an audit row must not roll back or mask
 * the action it describes -- particularly a successful post, where the row's
 * own columns are the operational record and this is the history. A failure
 * is logged server-side instead.
 *
 * It reports whether the row landed, so a caller performing something
 * consequential can tell the admin the audit trail is incomplete. That keeps
 * an audit outage visible without letting it undo a real post.
 *
 * Callers must not put credentials in `metadata`. Nothing that reaches this
 * function carries a token: the OAuth module never returns one to its callers.
 */
export async function recordEvent(input: EventInput): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("youtube_reply_events")
    .insert({
      queue_id: input.queueId,
      event_type: input.eventType,
      from_status: input.fromStatus ?? null,
      to_status: input.toStatus ?? null,
      actor_user_id: input.actorUserId ?? null,
      youtube_reply_id: input.youtubeReplyId ?? null,
      metadata: input.metadata ?? {},
    });

  if (error) {
    console.error("[youtube] could not record event", input.eventType, error.message);
    return false;
  }
  return true;
}

export interface EventRow {
  id: string;
  queue_id: string;
  event_type: YoutubeEventType;
  from_status: string | null;
  to_status: string | null;
  youtube_reply_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function listEvents(queueId: string, limit = 50): Promise<EventRow[]> {
  const { data } = await getSupabaseAdmin()
    .from("youtube_reply_events")
    .select("id, queue_id, event_type, from_status, to_status, youtube_reply_id, metadata, created_at")
    .eq("queue_id", queueId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as EventRow[];
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getQueueRow(id: string): Promise<QueueRow | null> {
  const { data } = await getSupabaseAdmin()
    .from("youtube_reply_queue")
    .select(QUEUE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  return (data as QueueRow | null) ?? null;
}

export interface QueueFilters {
  status?: string;
  batchId?: string;
  search?: string;
  limit?: number;
}

export async function listQueue(filters: QueueFilters = {}): Promise<QueueRow[]> {
  let query = getSupabaseAdmin().from("youtube_reply_queue").select(QUEUE_COLUMNS);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.batchId) query = query.eq("batch_id", filters.batchId);

  if (filters.search) {
    // Escape the PostgREST `or` filter's delimiters so a search string cannot
    // inject extra conditions.
    const term = filters.search.replace(/[(),*]/g, " ").trim();
    if (term) {
      const like = `%${term}%`;
      query = query.or(
        `author_name.ilike.${like},original_text.ilike.${like},video_title.ilike.${like},final_draft.ilike.${like}`
      );
    }
  }

  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);

  return (data ?? []) as QueueRow[];
}

export async function listBatches(limit = 50): Promise<BatchRow[]> {
  const { data } = await getSupabaseAdmin()
    .from("youtube_reply_batches")
    .select(
      "id, label, source_filename, kind, imported_at, total_rows, eligible_rows, imported_rows, skipped_rows, already_known_rows"
    )
    .order("imported_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as BatchRow[];
}

/**
 * One exact count per status.
 *
 * Deliberately not a single select("status") over every row: that is capped
 * by PostgREST's maximum row count, so past the ceiling the dashboard would
 * quietly under-report instead of erroring. head:true counts server-side and
 * transfers no rows at all.
 */
export async function countByStatus(): Promise<Record<string, number>> {
  const admin = getSupabaseAdmin();
  const results = await Promise.all(
    YOUTUBE_STATUSES.map(async (status) => {
      const { count } = await admin
        .from("youtube_reply_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      return [status, count ?? 0] as const;
    })
  );

  const counts: Record<string, number> = {};
  for (const [status, count] of results) {
    if (count > 0) counts[status] = count;
  }
  return counts;
}

/**
 * Replies accepted by YouTube in the last `hours`, for the safety cap.
 *
 * Counts api_accepted_at on the queue rows: a row that was later removed
 * still counts, because the cap is about how much was sent, not how much
 * survived. Rolling rather than calendar-day, so it holds no matter which
 * timezone the admin is in and cannot be reset by midnight passing.
 */
export async function countRecentPosts(hours = 24, excludeId?: string): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const admin = getSupabaseAdmin();

  let accepted = admin
    .from("youtube_reply_queue")
    .select("id", { count: "exact", head: true })
    .gte("api_accepted_at", since);

  // Rows claimed but not yet resolved. Counting these is what stops two
  // concurrent posts from both reading a pre-post count and both proceeding:
  // an in-flight claim occupies a slot from the moment it is made. A claim
  // that failed cleanly is back in FAILED and no longer counted, so a genuine
  // failure returns its slot; one with an unknown outcome stays POSTING and
  // keeps it, which is the conservative reading.
  let inFlight = admin
    .from("youtube_reply_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "POSTING")
    .gte("last_attempt_at", since);

  if (excludeId) {
    accepted = accepted.neq("id", excludeId);
    inFlight = inFlight.neq("id", excludeId);
  }

  const [acceptedResult, inFlightResult] = await Promise.all([accepted, inFlight]);
  return (acceptedResult.count ?? 0) + (inFlightResult.count ?? 0);
}

// ---------------------------------------------------------------------------
// The posting claim
// ---------------------------------------------------------------------------

/**
 * Moves a row APPROVED -> POSTING, and returns it only if this call is the
 * one that made the transition.
 *
 * This is the duplicate-post guard, and it is a single conditional UPDATE
 * rather than a read-then-write: two concurrent clicks both match `status =
 * APPROVED` on read, but only one can update it. The loser gets no row back
 * and is told the row is already in flight.
 *
 * POSTING is never reachable from a request body -- DECISION_ACTIONS has no
 * entry producing it. It exists only here.
 */
export async function claimForPosting(id: string): Promise<QueueRow | null> {
  const now = new Date().toISOString();
  const { data } = await getSupabaseAdmin()
    .from("youtube_reply_queue")
    .update({
      status: "POSTING",
      // attempt_count is bumped when the attempt resolves, not when it is
      // claimed, so the claimed row still carries the pre-attempt count.
      last_attempt_at: now,
      updated_at: now,
      // decided_by is deliberately NOT touched here: it records who approved
      // the row, which is a different decision from who sent it. Who posted
      // is captured on the POST_CLAIMED and API_ACCEPTED events.
    })
    .eq("id", id)
    .eq("status", "APPROVED")
    .select(QUEUE_COLUMNS)
    .maybeSingle();

  return (data as QueueRow | null) ?? null;
}

/**
 * Hands a claimed slot back, for the one case where a claim is made and then
 * abandoned before anything is sent: the daily ceiling turned out to be full.
 *
 * Only ever called before the YouTube request, so releasing cannot orphan a
 * real reply. Conditional on POSTING so it can never disturb a row whose
 * attempt has already resolved.
 */
export async function releaseClaim(id: string): Promise<void> {
  await getSupabaseAdmin()
    .from("youtube_reply_queue")
    .update({ status: "APPROVED", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "POSTING");
}

export interface PostSuccessInput {
  id: string;
  replyId: string;
  actorUserId: string;
  attemptCount: number;
}

/**
 * Records that YouTube accepted a reply.
 *
 * Returns whether the write landed instead of ignoring it. This is the one
 * place where a database failure means something has already happened in the
 * outside world: the reply exists, and if its id is not stored, verification
 * -- which queries that exact id -- can never run on it again. So the caller
 * is told, and surfaces the id to the admin rather than reporting a clean
 * success over a row that silently stayed in POSTING.
 */
export async function markApiAccepted(input: PostSuccessInput): Promise<{ persisted: boolean }> {
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("youtube_reply_queue")
    .update({
      status: "API_ACCEPTED",
      posted_reply_id: input.replyId,
      api_accepted_at: now,
      attempt_count: input.attemptCount + 1,
      last_error: null,
      updated_at: now,
    })
    .eq("id", input.id);

  if (error) {
    console.error(
      "[youtube] REPLY POSTED BUT NOT RECORDED -- queue row",
      input.id,
      "reply id",
      input.replyId,
      error.message
    );
    return { persisted: false };
  }
  return { persisted: true };
}

export interface PostFailureInput {
  id: string;
  actorUserId: string;
  attemptCount: number;
  message: string;
  /** True when it is unknown whether the reply was created. */
  outcomeUnknown: boolean;
}

/**
 * Records a failed attempt.
 *
 * When the outcome is unknown -- a request that died in flight, which may
 * still have created a reply -- the row is deliberately LEFT in POSTING
 * rather than dropped to FAILED. FAILED is re-approvable, and re-approving a
 * reply that did post would duplicate it. A human has to look at YouTube and
 * release the row explicitly.
 */
export async function markPostFailed(input: PostFailureInput): Promise<void> {
  const now = new Date().toISOString();
  await getSupabaseAdmin()
    .from("youtube_reply_queue")
    .update({
      status: input.outcomeUnknown ? "POSTING" : "FAILED",
      attempt_count: input.attemptCount + 1,
      last_error: input.message.slice(0, 500),
      updated_at: now,
    })
    .eq("id", input.id);
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

export interface CreateBatchInput {
  label: string;
  sourceFilename: string | null;
  kind: "xlsx" | "legacy";
  importedBy: string;
}

export async function createBatch(input: CreateBatchInput): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .from("youtube_reply_batches")
    .insert({
      label: input.label,
      source_filename: input.sourceFilename,
      kind: input.kind,
      imported_by: input.importedBy,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error("could not create batch");
  return data.id as string;
}

export interface ImportOutcome {
  imported: number;
  alreadyKnown: number;
}

/**
 * Inserts sheet rows, one at a time, letting the unique constraint on
 * youtube_comment_id decide what is new.
 *
 * A collision means this comment is already in the queue from an earlier
 * import -- possibly already replied to. It is counted as "already known" and
 * left completely untouched. Re-importing an overlapping sheet must never
 * resurrect a row into a postable state, so the existing row's status,
 * decisions and posting history all win over whatever the new sheet says.
 */
export async function insertCandidates(
  batchId: string,
  candidates: ImportCandidate[]
): Promise<ImportOutcome> {
  const admin = getSupabaseAdmin();
  let imported = 0;
  let alreadyKnown = 0;

  for (const candidate of candidates) {
    // `eligible` is a derived fact used to pick the initial status, not a
    // column -- it is stripped before the insert rather than stored, so the
    // rule and the row can never disagree later.
    const columns: Partial<ImportCandidate> = { ...candidate };
    delete columns.eligible;

    const { data, error } = await admin
      .from("youtube_reply_queue")
      .insert({ ...columns, batch_id: batchId })
      .select("id")
      .maybeSingle();

    if (error) {
      // 23505 = unique_violation on youtube_comment_id.
      if (error.code === "23505") {
        alreadyKnown++;
        continue;
      }
      throw new Error(`import failed at sheet row ${candidate.spreadsheet_row}`);
    }

    if (data) {
      imported++;
      await recordEvent({
        queueId: data.id as string,
        eventType: "IMPORTED",
        toStatus: candidate.status,
        metadata: {
          spreadsheet_row: candidate.spreadsheet_row,
          eligible: candidate.eligible,
          automation_action: candidate.automation_action,
          source_type: candidate.source_type,
        },
      });
    }
  }

  return { imported, alreadyKnown };
}

export interface LegacyOutcome {
  inserted: number;
  updatedExisting: number;
}

/**
 * The one-time import of the old bot's posted_replies.json.
 *
 * Two cases, and the update case is the important one. If a comment is
 * already in the queue from a spreadsheet import, it may be sitting in
 * DRAFTED or even APPROVED -- looking, entirely wrongly, like something
 * waiting to be replied to. The bot already replied to it. So the existing
 * row is stamped legacy and moved to API_ACCEPTED, which is not postable.
 *
 * Statuses that already reflect a checked reality (VERIFIED_LIVE, REMOVED)
 * are never overwritten: a confirmed removal is a stronger fact than the
 * JSON file's record that the reply was once created.
 */
export async function importLegacyRecords(
  batchId: string,
  records: LegacyRecord[],
  actorUserId: string,
  legacySource: string
): Promise<LegacyOutcome> {
  const admin = getSupabaseAdmin();
  let inserted = 0;
  let updatedExisting = 0;

  for (const record of records) {
    const status = legacyStatusFor(record);

    const { data: existing } = await admin
      .from("youtube_reply_queue")
      .select("id, status, posted_reply_id")
      .eq("youtube_comment_id", record.youtube_comment_id)
      .maybeSingle();

    if (existing) {
      const current = existing.status as YoutubeReplyStatus;
      const settled = current === "VERIFIED_LIVE" || current === "REMOVED";
      const nextStatus = settled ? current : status;

      await admin
        .from("youtube_reply_queue")
        .update({
          is_legacy: true,
          legacy_source: legacySource,
          posted_reply_id: existing.posted_reply_id ?? record.posted_reply_id,
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      await recordEvent({
        queueId: existing.id as string,
        eventType: "LEGACY_IMPORTED",
        fromStatus: current,
        toStatus: nextStatus,
        actorUserId,
        youtubeReplyId: record.posted_reply_id,
        metadata: { matched_existing: true, legacy_source: legacySource },
      });
      updatedExisting++;
      continue;
    }

    const { data, error } = await admin
      .from("youtube_reply_queue")
      .insert({
        batch_id: batchId,
        youtube_comment_id: record.youtube_comment_id,
        posted_reply_id: record.posted_reply_id,
        author_name: record.author_name,
        final_draft: record.final_draft,
        video_id: record.video_id,
        spreadsheet_row: record.spreadsheet_row,
        source_type: "comment",
        automation_action: "POST",
        status,
        is_legacy: true,
        legacy_source: legacySource,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") continue;
      throw new Error("legacy import failed");
    }

    if (data) {
      inserted++;
      await recordEvent({
        queueId: data.id as string,
        eventType: "LEGACY_IMPORTED",
        toStatus: status,
        actorUserId,
        youtubeReplyId: record.posted_reply_id,
        metadata: { matched_existing: false, legacy_source: legacySource },
      });
    }
  }

  return { inserted, updatedExisting };
}

export interface BatchCountsInput {
  batchId: string;
  totalRows: number;
  eligibleRows: number;
  importedRows: number;
  skippedRows: number;
  alreadyKnownRows: number;
  notes?: string | null;
}

export async function updateBatchCounts(input: BatchCountsInput): Promise<void> {
  await getSupabaseAdmin()
    .from("youtube_reply_batches")
    .update({
      total_rows: input.totalRows,
      eligible_rows: input.eligibleRows,
      imported_rows: input.importedRows,
      skipped_rows: input.skippedRows,
      already_known_rows: input.alreadyKnownRows,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.batchId);
}
