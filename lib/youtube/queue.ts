import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  batchAllowance,
  DEFAULT_DAILY_POST_LIMIT,
  DEFAULT_MIN_VERIFY_AGE_HOURS,
  YOUTUBE_STATUSES,
  readPositiveIntEnv,
  type BatchAllowance,
  type YoutubeEventType,
  type YoutubeReplyStatus,
} from "./queue-schema";
import type { OpportunityType, Priority, PromotionCategory } from "./classify";
import { dayRange, readTimezone, zonedDayString, type DayRange } from "./day-window";
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
  discovered_at, comment_posted_at, priority, opportunity_type,
  promotion_category, manual_follow_up, feature_tags, source_channel_id,
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
  discovered_at: string | null;
  comment_posted_at: string | null;
  priority: Priority;
  opportunity_type: OpportunityType | null;
  promotion_category: PromotionCategory;
  manual_follow_up: boolean;
  feature_tags: string[] | null;
  source_channel_id: string | null;
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

/**
 * The timezone every "day" in this feature is expressed in.
 *
 * One place, so the Today view, the daily archive and the posting cap can
 * never disagree about where a day starts. KMate has no app-wide timezone to
 * inherit, so this defaults to Asia/Kolkata; an unrecognised value falls back
 * rather than throwing the dashboard.
 */
export function outreachTimezone(): string {
  return readTimezone(process.env.YOUTUBE_TIMEZONE);
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
  /** The local day being viewed, already resolved to a UTC range. */
  range?: DayRange | null;
  /**
   * Include still-pending rows discovered before `range` -- the carry-forward
   * set. Only meaningful for the current day's working view.
   */
  includeCarryForward?: boolean;
  priority?: string;
  opportunityType?: string;
  promotionCategory?: string;
  featureTag?: string;
  channel?: string;
  manualFollowUp?: boolean;
  legacy?: boolean;
  author?: string;
  /** 'newest' | 'oldest' by the comment's own age; priority always leads. */
  sort?: "newest" | "oldest";
}

/** Statuses that still represent outstanding work, and so carry forward. */
export const PENDING_STATUSES: readonly YoutubeReplyStatus[] = [
  "SCRAPED",
  "DRAFTED",
  "APPROVED",
  "HOLD",
  "FAILED",
];

/** The queue table selected with the standard column list. */
function baseQueueQuery() {
  return getSupabaseAdmin().from("youtube_reply_queue").select(QUEUE_COLUMNS);
}
// Derived from a real call rather than hand-written, so it tracks the client's
// builder type instead of drifting from it.
type QueueQuery = ReturnType<typeof baseQueueQuery>;

/** Applies every filter that is independent of the day window. */
function applyCommonFilters(query: QueueQuery, filters: QueueFilters): QueueQuery {
  let q = query;
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.batchId) q = q.eq("batch_id", filters.batchId);
  if (filters.priority) q = q.eq("priority", filters.priority);
  if (filters.opportunityType) q = q.eq("opportunity_type", filters.opportunityType);
  if (filters.promotionCategory) q = q.eq("promotion_category", filters.promotionCategory);
  if (filters.channel) q = q.eq("channel_title", filters.channel);
  if (filters.manualFollowUp !== undefined) q = q.eq("manual_follow_up", filters.manualFollowUp);
  if (filters.legacy !== undefined) q = q.eq("is_legacy", filters.legacy);
  if (filters.author) q = q.eq("author_name", filters.author);
  // contains, so a row tagged with several features still matches one of them.
  if (filters.featureTag) q = q.contains("feature_tags", [filters.featureTag]);

  if (filters.search) {
    // Strip the PostgREST `or` filter's own delimiters so a search string
    // cannot inject extra conditions.
    const term = filters.search.replace(/[(),*]/g, " ").trim();
    if (term) {
      const like = `%${term}%`;
      q = q.or(
        `author_name.ilike.${like},original_text.ilike.${like},video_title.ilike.${like},final_draft.ilike.${like}`
      );
    }
  }
  return q;
}

/**
 * Rows relevant to one view.
 *
 * A day's rows are the rows that DID something that day -- were discovered,
 * decided, sent, verified or found removed -- not a per-day copy of the queue.
 * Nothing is written to build a view.
 *
 * Carry-forward is the second half. Work discovered yesterday and still
 * pending has to appear in today's queue or it silently falls off the end of
 * the workspace. It is fetched as a separate query and merged by id, so a row
 * that qualifies BOTH ways (discovered today and still pending) appears
 * exactly once. Its discovered_at, imported_at and batch are untouched --
 * carry-forward is a property of the view, never an edit to the row, which is
 * why the "Carried from" chip is derived at render time.
 */
export async function listQueue(filters: QueueFilters = {}): Promise<QueueRow[]> {
  const limit = filters.limit ?? 200;
  const range = filters.range;

  // A fresh builder per query: the two halves of a day view are separate
  // round trips, and a PostgREST builder cannot be reused once awaited.
  const base = () => applyCommonFilters(baseQueueQuery(), filters);

  const collected = new Map<string, QueueRow>();

  if (!range) {
    const { data, error } = await base().order("created_at", { ascending: false }).limit(limit);
    // Thrown, not swallowed. A missing column (an unapplied migration) would
    // otherwise return no rows and no error, and the page would render an
    // empty workspace instead of saying the schema needs applying.
    if (error) throw new Error(`youtube queue read failed: ${error.message}`);
    for (const row of (data ?? []) as QueueRow[]) collected.set(row.id, row);
  } else {
    const from = range.startUtc.toISOString();
    const to = range.endUtc.toISOString();
    // Half-open on every column: gte start, lt end. Consecutive days
    // therefore partition time exactly -- no gap, nothing counted twice.
    const activity = `and(discovered_at.gte.${from},discovered_at.lt.${to}),and(decided_at.gte.${from},decided_at.lt.${to}),and(api_accepted_at.gte.${from},api_accepted_at.lt.${to}),and(verified_at.gte.${from},verified_at.lt.${to}),and(removed_detected_at.gte.${from},removed_detected_at.lt.${to})`;

    const { data, error } = await base().or(activity).order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(`youtube queue read failed: ${error.message}`);
    for (const row of (data ?? []) as QueueRow[]) collected.set(row.id, row);

    if (filters.includeCarryForward) {
      const { data: carried, error: carriedError } = await base()
        .lt("discovered_at", from)
        .in("status", PENDING_STATUSES as unknown as string[])
        .eq("manual_follow_up", filters.manualFollowUp ?? false)
        .order("discovered_at", { ascending: true })
        .limit(limit);
      if (carriedError) throw new Error(`youtube carry-forward read failed: ${carriedError.message}`);
      // Merged by id: a row already collected above is not added again.
      for (const row of (carried ?? []) as QueueRow[]) collected.set(row.id, row);
    }
  }

  return sortQueue([...collected.values()], filters.sort ?? "newest");
}

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * High priority first, then by comment age in the requested direction.
 *
 * Ordering only. Priority decides what an admin sees first; it has no bearing
 * on whether a row may be posted, which `postRefusal` alone decides.
 */
export function sortQueue(rows: QueueRow[], direction: "newest" | "oldest"): QueueRow[] {
  const timeOf = (r: QueueRow) =>
    new Date(r.comment_posted_at ?? r.discovered_at ?? r.created_at).getTime();

  return [...rows].sort((a, b) => {
    const byPriority = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    if (byPriority !== 0) return byPriority;
    const at = timeOf(a);
    const bt = timeOf(b);
    if (at === bt) return 0;
    return direction === "newest" ? bt - at : at - bt;
  });
}

/**
 * The rows a batch may actually draw from, best first.
 *
 * A candidate list only. Every row is re-resolved and re-checked individually
 * inside the posting loop, so this ordering is a convenience for the admin and
 * never an authorisation.
 */
export async function listPostable(limit = 50): Promise<QueueRow[]> {
  const { data } = await getSupabaseAdmin()
    .from("youtube_reply_queue")
    .select(QUEUE_COLUMNS)
    .eq("status", "APPROVED")
    .eq("manual_follow_up", false)
    .eq("is_legacy", false)
    .eq("source_type", "comment")
    .eq("automation_action", "POST")
    .is("posted_reply_id", null)
    .limit(limit);

  return sortQueue((data ?? []) as QueueRow[], "oldest");
}

/** How many rows could be posted right now, for the batch allowance. */
export async function countPostable(): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from("youtube_reply_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "APPROVED")
    .eq("manual_follow_up", false)
    .eq("is_legacy", false)
    .eq("source_type", "comment")
    .eq("automation_action", "POST")
    .is("posted_reply_id", null);

  return count ?? 0;
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

/** The day window the posting cap is measured over, right now. */
export function currentDayRange(now: Date = new Date()): DayRange {
  const tz = outreachTimezone();
  return dayRange(zonedDayString(now, tz), tz);
}

/**
 * Replies sent, or in flight, between two instants.
 *
 * Counts two things, and both matter:
 *
 *   - rows whose api_accepted_at falls in the window. A reply later found
 *     REMOVED still counts: the ceiling limits what was SENT, not what
 *     survived, so a removal cannot buy back an attempt.
 *   - rows currently claimed as POSTING whose attempt began in the window.
 *     Counting these is what stops two concurrent requests from both reading
 *     a pre-send total and both proceeding. A claim occupies a slot from the
 *     moment it is made; a clean failure returns the row to FAILED and gives
 *     the slot back, while an ambiguous one stays POSTING and keeps it.
 *
 * `to` is optional because the rolling window has no upper bound worth
 * stating -- nothing can be sent in the future, and leaving it open avoids a
 * claim made microseconds ago falling outside its own window.
 */
export async function countSentBetween(
  from: Date,
  to: Date | null,
  excludeId?: string
): Promise<number> {
  const admin = getSupabaseAdmin();
  const fromIso = from.toISOString();
  const toIso = to?.toISOString();

  let accepted = admin
    .from("youtube_reply_queue")
    .select("id", { count: "exact", head: true })
    .gte("api_accepted_at", fromIso);

  let inFlight = admin
    .from("youtube_reply_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "POSTING")
    .gte("last_attempt_at", fromIso);

  if (toIso) {
    accepted = accepted.lt("api_accepted_at", toIso);
    inFlight = inFlight.lt("last_attempt_at", toIso);
  }

  if (excludeId) {
    accepted = accepted.neq("id", excludeId);
    inFlight = inFlight.neq("id", excludeId);
  }

  const [acceptedResult, inFlightResult] = await Promise.all([accepted, inFlight]);
  return (acceptedResult.count ?? 0) + (inFlightResult.count ?? 0);
}

/** Sent or in flight inside one local calendar day. */
export async function countPostsInWindow(range: DayRange, excludeId?: string): Promise<number> {
  return countSentBetween(range.startUtc, range.endUtc, excludeId);
}

/** Sent or in flight inside the last rolling 24 hours. */
export async function countPostsInRollingWindow(
  now: Date = new Date(),
  excludeId?: string
): Promise<number> {
  return countSentBetween(new Date(now.getTime() - ROLLING_WINDOW_HOURS * 3600_000), null, excludeId);
}

/** The rolling backstop's width. Deliberately the same "day" the cap names. */
export const ROLLING_WINDOW_HOURS = 24;

/**
 * The live allowance, measured against BOTH windows.
 *
 * The single source of truth for "may anything be sent right now". The
 * calendar day matches what the admin sees; the rolling 24 hours stops the
 * midnight reset from permitting a burst across the boundary. The stricter of
 * the two governs, and both are recomputed from the database on every call --
 * the posting loop re-derives this before every individual row.
 */
export async function postAllowance(
  eligible: number,
  now: Date = new Date(),
  excludeId?: string
): Promise<BatchAllowance> {
  const [dayUsed, rollingUsed] = await Promise.all([
    countPostsInWindow(currentDayRange(now), excludeId),
    countPostsInRollingWindow(now, excludeId),
  ]);
  return batchAllowance(dailyPostLimit(), dayUsed, rollingUsed, eligible);
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
      .insert({
        ...columns,
        batch_id: batchId,
        // A sheet without a captured_at column would otherwise leave the row
        // outside every daily view. Import time is the honest fallback for
        // "when did we first see this".
        discovered_at: candidate.discovered_at ?? new Date().toISOString(),
      })
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
        // discovered_at is left NULL on purpose. These replies were sent by
        // the old bot months ago; stamping them with the import time would
        // dump a hundred historical rows into today's "discovered" count and
        // make the daily workspace useless on the day of the migration.
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
