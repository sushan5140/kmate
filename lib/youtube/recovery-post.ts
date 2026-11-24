import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { fetchAuthenticatedChannel, fetchReplyLookup, fetchRepliesForParent, insertReply } from "./api";
import {
  sanitiseEventMetadata,
  type RecoveryEventInput,
  type RecoveryEventType,
} from "./recovery-events";
import {
  executeStuckResolution,
  type ResolveDeps,
  type ResolveOutcome,
  type StuckRow,
} from "./recovery-resolve";
import {
  executeConfirmation,
  type ConfirmDeps,
  type ConfirmOutcome,
  type ConfirmRow,
} from "./recovery-confirm";
import {
  RETRY_FROM_STATUS,
  RETRY_TO_STATUS,
  executeRetryAuthorization,
  type RetryDeps,
  type RetryOutcome,
  type RetryRow,
} from "./recovery-retry";
import { DEFAULT_TIMEZONE, readTimezone, today } from "./day-window";
import {
  CLAIM_FROM_STATUS,
  CLAIM_TO_STATUS,
  RECOVERY_DAILY_SEND_LIMIT,
  executeRecoverySend,
  type RecoverySendDeps,
  type RecoverySendOutcome,
  type RecoverySendRow,
} from "./recovery-send";

/**
 * Server wiring for the recovery send path.
 *
 * Deliberately thin. Every decision -- eligibility, the fresh-verification
 * rule, what a failure means, what may be sent -- lives in recovery-send.ts,
 * which is pure and directly testable. This file only supplies the database
 * and the YouTube calls, so there is one place to read the policy and one
 * place to read the plumbing.
 *
 * This module is reachable ONLY from the admin send route, after
 * requireAdmin-equivalent authorization. Recovery tables stay service-role
 * only: nothing here runs with a browser's credentials.
 *
 * There is no cron, no queue drainer and no retry loop in this file, and there
 * must not be one. Every send is one authenticated admin acting on one row.
 */

/** Explicit column list -- no select("*"). */
const SEND_COLUMNS =
  "id, status, legacy_outcome, legacy_reply_id, youtube_comment_id, draft_text, posted_reply_id, attempt_count";

/**
 * Appends one audit event.
 *
 * Never throws into a caller. An audit outage is logged and reported, but it
 * must not undo a real post or block a resolution -- the same trade-off
 * queue.ts already makes for outreach events.
 */
export async function recordRecoveryEvent(input: RecoveryEventInput): Promise<boolean> {
  try {
    const { error } = await getSupabaseAdmin()
      .from("youtube_reply_recovery_events")
      .insert({
        attempt_id: input.attemptId,
        event_type: input.eventType,
        from_status: input.fromStatus ?? null,
        to_status: input.toStatus ?? null,
        actor_user_id: input.actorUserId ?? null,
        youtube_reply_id: input.youtubeReplyId ?? null,
        attempt_number: input.attemptNumber ?? null,
        metadata: sanitiseEventMetadata(input.metadata ?? {}),
      });
    if (error) {
      console.error("[youtube-recovery] could not record event", input.eventType, error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      "[youtube-recovery] refused to record event",
      input.eventType,
      error instanceof Error ? error.message : "unknown"
    );
    return false;
  }
}

export interface RecoveryEventRow {
  id: string;
  event_type: RecoveryEventType;
  from_status: string | null;
  to_status: string | null;
  youtube_reply_id: string | null;
  attempt_number: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function listRecoveryEvents(attemptId: string, limit = 50): Promise<RecoveryEventRow[]> {
  const { data } = await getSupabaseAdmin()
    .from("youtube_reply_recovery_events")
    .select("id, event_type, from_status, to_status, youtube_reply_id, attempt_number, metadata, created_at")
    .eq("attempt_id", attemptId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as RecoveryEventRow[];
}

function asRow(record: Record<string, unknown>): RecoverySendRow {
  return {
    id: String(record.id),
    status: String(record.status),
    legacy_outcome: String(record.legacy_outcome),
    legacy_reply_id: String(record.legacy_reply_id),
    youtube_comment_id: String(record.youtube_comment_id),
    draft_text: String(record.draft_text),
    posted_reply_id: (record.posted_reply_id as string | null) ?? null,
    attempt_count: Number(record.attempt_count ?? 0),
  };
}

/**
 * The real dependencies.
 *
 * The claim is the interesting one: a conditional UPDATE that matches only a
 * row still APPROVED, still unsent, and still at the attempt count the
 * eligibility check was made against. Postgres applies it atomically, so two
 * concurrent requests both issuing it produce exactly one updated row and one
 * empty result -- the loser gets null and refuses. This is the same shape the
 * outreach queue uses to claim a batch row, and the same shape
 * decideRecoveryAttempt uses to guard a decision.
 */
/** Today, in the configured YouTube timezone -- not UTC, not the server's zone. */
export function recoverySendDay(now = new Date()): string {
  return today(now, readTimezone(process.env.YOUTUBE_TIMEZONE) || DEFAULT_TIMEZONE);
}

export function realRecoverySendDeps(id: string, actorUserId: string): RecoverySendDeps {
  const admin = getSupabaseAdmin();

  return {
    async loadRow(id) {
      const { data, error } = await admin
        .from("youtube_reply_recovery_attempts")
        .select(SEND_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`Could not read recovery attempt: ${error.message}`);
      return data ? asRow(data as Record<string, unknown>) : null;
    },

    /**
     * How many of today's send slots are already spent.
     *
     * Returns null -- which blocks -- on any error. A count we could not read
     * is not a count of zero, and treating it as zero is precisely how a cap
     * quietly stops capping.
     */
    async dailyUsage() {
      const { count, error } = await admin
        .from("youtube_reply_recovery_send_budget")
        .select("slot", { count: "exact", head: true })
        .eq("send_day", recoverySendDay());
      if (error || count === null || count === undefined) return null;
      return count;
    },

    /**
     * Take one of today's slots. The primary key on (send_day, slot) is what
     * makes this atomic: a duplicate insert fails with 23505 regardless of how
     * two requests interleave.
     */
    async consumeDailyBudget(rowId) {
      const day = recoverySendDay();
      for (let slot = 0; slot < RECOVERY_DAILY_SEND_LIMIT; slot++) {
        const { error } = await admin
          .from("youtube_reply_recovery_send_budget")
          .insert({ send_day: day, slot, attempt_id: rowId });
        if (!error) return slot;
        // 23505 = the slot is taken. Anything else is a real failure, and a
        // failure to record the budget must not permit the send.
        if (error.code !== "23505") return null;
      }
      return null;
    },

    async releaseDailyBudget(slot) {
      // Only ever called when the claim did not apply, i.e. nothing was sent.
      await admin
        .from("youtube_reply_recovery_send_budget")
        .delete()
        .eq("send_day", recoverySendDay())
        .eq("slot", slot);
    },

    async authenticatedChannel() {
      return fetchAuthenticatedChannel();
    },

    async lookupReply(legacyReplyId) {
      return fetchReplyLookup(legacyReplyId);
    },

    async claim(id, expect) {
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("youtube_reply_recovery_attempts")
        .update({
          status: CLAIM_TO_STATUS,
          attempt_count: expect.attemptCount + 1,
          last_attempt_at: now,
          updated_at: now,
        })
        .eq("id", id)
        // The three conditions that make this a claim rather than a write.
        .eq("status", expect.status)
        .eq("attempt_count", expect.attemptCount)
        .is("posted_reply_id", null)
        .select(SEND_COLUMNS)
        .maybeSingle();
      if (error) throw new Error(`Could not claim recovery attempt: ${error.message}`);
      return data ? asRow(data as Record<string, unknown>) : null;
    },

    async insertReply(payload) {
      // parentId and text come from the claimed row only -- see buildSendPayload.
      return insertReply(payload.parentId, payload.text);
    },

    async recordAccepted(id, replyId) {
      const now = new Date().toISOString();
      const { error } = await admin
        .from("youtube_reply_recovery_attempts")
        .update({
          status: "API_ACCEPTED",
          posted_reply_id: replyId,
          api_accepted_at: now,
          last_error: null,
          updated_at: now,
        })
        .eq("id", id)
        // Only the row this call claimed.
        .eq("status", CLAIM_TO_STATUS);
      if (error) throw new Error(`Reply sent but the row could not be updated: ${error.message}`);
    },

    async recordFailure(id, status, note) {
      const now = new Date().toISOString();
      // status null means "leave it POSTING" -- the outcome-unknown case. The
      // note is still written, because that row now needs a human and the note
      // is the only record of why.
      const patch: Record<string, unknown> = { last_error: note, updated_at: now };
      if (status) patch.status = status;
      const { error } = await admin
        .from("youtube_reply_recovery_attempts")
        .update(patch)
        .eq("id", id)
        .eq("status", CLAIM_TO_STATUS);
      if (error) throw new Error(`Could not record the send failure: ${error.message}`);
    },

    async recordEvent(input) {
      await recordRecoveryEvent({
        attemptId: id,
        eventType: input.type,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorUserId,
        youtubeReplyId: input.youtubeReplyId,
        attemptNumber: input.attemptNumber,
        metadata: input.metadata,
      });
    },

    now() {
      return new Date().toISOString();
    },
  };
}

/**
 * Send one approved recovery attempt.
 *
 * `id` is the ONLY caller-supplied value. The parent comment, the reply text,
 * the legacy reply id and the category are all read from the row after
 * authorization -- a request body cannot contribute to what gets posted.
 */
export async function sendRecoveryAttempt(id: string, actorUserId: string): Promise<RecoverySendOutcome> {
  return executeRecoverySend(realRecoverySendDeps(id, actorUserId), id);
}

// ---------------------------------------------------------------------------
// Stuck-send resolution (read-only investigation)
// ---------------------------------------------------------------------------

const RESOLVE_COLUMNS =
  "id, status, youtube_comment_id, draft_text, posted_reply_id, attempt_count, last_attempt_at";

export function realResolveDeps(id: string, actorUserId: string): ResolveDeps {
  const admin = getSupabaseAdmin();

  return {
    async loadRow(rowId) {
      const { data, error } = await admin
        .from("youtube_reply_recovery_attempts")
        .select(RESOLVE_COLUMNS)
        .eq("id", rowId)
        .maybeSingle();
      if (error) throw new Error(`Could not read recovery attempt: ${error.message}`);
      if (!data) return null;
      const record = data as Record<string, unknown>;
      return {
        id: String(record.id),
        status: String(record.status),
        youtube_comment_id: String(record.youtube_comment_id),
        draft_text: String(record.draft_text),
        posted_reply_id: (record.posted_reply_id as string | null) ?? null,
        attempt_count: Number(record.attempt_count ?? 0),
        last_attempt_at: (record.last_attempt_at as string | null) ?? null,
      } satisfies StuckRow;
    },

    async authenticatedChannel() {
      return fetchAuthenticatedChannel();
    },

    // Read-only. There is no insert reachable from the resolver.
    async listReplies(parentId) {
      return fetchRepliesForParent(parentId);
    },

    async markAccepted(rowId, replyId, apiAcceptedAt) {
      const { data, error } = await admin
        .from("youtube_reply_recovery_attempts")
        .update({
          status: "API_ACCEPTED",
          posted_reply_id: replyId,
          // YouTube's own publish time, never invented.
          api_accepted_at: apiAcceptedAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rowId)
        // Guarded: only a row still stuck, and still unsent.
        .eq("status", CLAIM_TO_STATUS)
        .is("posted_reply_id", null)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`Could not record the resolution: ${error.message}`);
      return Boolean(data);
    },

    async recordEvent(input) {
      await recordRecoveryEvent({
        attemptId: id,
        eventType: input.resolved ? "RECOVERY_STUCK_RESOLVED" : "RECOVERY_STUCK_UNRESOLVED",
        fromStatus: CLAIM_TO_STATUS,
        toStatus: input.resolved ? "API_ACCEPTED" : CLAIM_TO_STATUS,
        actorUserId,
        youtubeReplyId: input.replyId,
        metadata: {
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.publishedAt ? { published_at: input.publishedAt } : {}),
          candidates_examined: input.examined,
          candidates_matched: input.matched,
        },
      });
    },

    now: () => Date.now(),
  };
}

/**
 * Investigate one row stuck in POSTING. Read-only against YouTube: this path
 * cannot create a reply, and it only writes when it has positively identified
 * one that already exists.
 */
export async function resolveStuckRecoverySend(
  id: string,
  actorUserId: string
): Promise<ResolveOutcome> {
  return executeStuckResolution(realResolveDeps(id, actorUserId), id);
}

// ---------------------------------------------------------------------------
// Human-authorized retry of a definite failure
// ---------------------------------------------------------------------------

const RETRY_COLUMNS =
  "id, status, legacy_outcome, legacy_reply_id, posted_reply_id, attempt_count, last_error";

export function realRetryDeps(id: string, actorUserId: string): RetryDeps {
  const admin = getSupabaseAdmin();

  return {
    async loadRow(rowId) {
      const { data, error } = await admin
        .from("youtube_reply_recovery_attempts")
        .select(RETRY_COLUMNS)
        .eq("id", rowId)
        .maybeSingle();
      if (error) throw new Error(`Could not read recovery attempt: ${error.message}`);
      if (!data) return null;
      const record = data as Record<string, unknown>;
      return {
        id: String(record.id),
        status: String(record.status),
        legacy_outcome: String(record.legacy_outcome),
        legacy_reply_id: String(record.legacy_reply_id),
        posted_reply_id: (record.posted_reply_id as string | null) ?? null,
        attempt_count: Number(record.attempt_count ?? 0),
        last_error: (record.last_error as string | null) ?? null,
      } satisfies RetryRow;
    },

    /**
     * An unknown outcome with no later resolution blocks any retry.
     *
     * Read from the event trail rather than inferred from columns: the trail is
     * the durable history, and a row whose ambiguity was never resolved must
     * stay blocked even if its status was changed by some other route.
     */
    async ambiguityEvidence(rowId, row) {
      const { data, error } = await admin
        .from("youtube_reply_recovery_events")
        .select("event_type, created_at")
        .eq("attempt_id", rowId)
        .order("created_at", { ascending: false })
        .limit(200);

      // The table is missing, unreadable, or the query failed. We cannot show
      // the first attempt created nothing, so we do not retry.
      if (error || !data) return "unavailable";

      const types = (data as Array<{ event_type?: string }>).map((e) => e.event_type);

      // A row that has been attempted MUST have left a trail. An empty history
      // on an attempted row means entries are missing, not that all is well.
      if (row.attempt_count > 0 && types.length === 0) return "unavailable";

      const decisive = types.find(
        (t) => t === "RECOVERY_OUTCOME_UNKNOWN" || t === "RECOVERY_STUCK_RESOLVED"
      );
      return decisive === "RECOVERY_OUTCOME_UNKNOWN" ? "unresolved" : "clear";
    },

    async authenticatedChannel() {
      return fetchAuthenticatedChannel();
    },

    async lookupReply(legacyReplyId) {
      return fetchReplyLookup(legacyReplyId);
    },

    /**
     * FAILED -> APPROVED, guarded.
     *
     * attempt_count and last_error are deliberately NOT reset: the retry is a
     * new authorization, not a pretence that the failure never happened. The
     * attempt cap reads that preserved count, so provenance and safety are the
     * same fact here.
     */
    async authorize(rowId, expect) {
      const { data, error } = await admin
        .from("youtube_reply_recovery_attempts")
        .update({ status: RETRY_TO_STATUS, updated_at: new Date().toISOString() })
        .eq("id", rowId)
        .eq("status", expect.status)
        .eq("attempt_count", expect.attemptCount)
        .is("posted_reply_id", null)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`Could not authorize the retry: ${error.message}`);
      return Boolean(data);
    },

    async recordEvent(input) {
      await recordRecoveryEvent({
        attemptId: id,
        eventType: "RECOVERY_RETRY_AUTHORIZED",
        fromStatus: RETRY_FROM_STATUS,
        toStatus: input.reason ? RETRY_FROM_STATUS : RETRY_TO_STATUS,
        actorUserId,
        attemptNumber: input.previousAttemptCount + 1,
        metadata: {
          ...(input.reason ? { reason: input.reason } : { result: "authorized" }),
          previous_attempt_count: input.previousAttemptCount,
          ...(input.previousError ? { previous_error: input.previousError.slice(0, 500) } : {}),
        },
      });
    },
  };
}

/**
 * Authorize one more attempt on a row that definitely failed. Does not send:
 * it returns the row to APPROVED, and the ordinary send path -- with its own
 * fresh verification and atomic claim -- runs afterwards.
 */
export async function authorizeRecoveryRetry(id: string, actorUserId: string): Promise<RetryOutcome> {
  return executeRetryAuthorization(realRetryDeps(id, actorUserId), id);
}

// ---------------------------------------------------------------------------
// Post-acceptance verification (read-only)
// ---------------------------------------------------------------------------

const CONFIRM_COLUMNS = "id, status, youtube_comment_id, posted_reply_id";

export function realConfirmDeps(id: string, actorUserId: string): ConfirmDeps {
  const admin = getSupabaseAdmin();

  return {
    async loadRow(rowId) {
      const { data, error } = await admin
        .from("youtube_reply_recovery_attempts")
        .select(CONFIRM_COLUMNS)
        .eq("id", rowId)
        .maybeSingle();
      if (error) throw new Error(`Could not read recovery attempt: ${error.message}`);
      if (!data) return null;
      const record = data as Record<string, unknown>;
      return {
        id: String(record.id),
        status: String(record.status),
        youtube_comment_id: String(record.youtube_comment_id),
        posted_reply_id: (record.posted_reply_id as string | null) ?? null,
      } satisfies ConfirmRow;
    },

    async authenticatedChannel() {
      return fetchAuthenticatedChannel();
    },

    async lookupReply(replyId) {
      return fetchReplyLookup(replyId);
    },

    async applyVerdict(rowId, fromStatus, verdict) {
      const now = new Date().toISOString();
      const patch: Record<string, unknown> =
        verdict === "VERIFIED_LIVE"
          ? { status: "VERIFIED_LIVE", verified_at: now, last_verified_at: now, updated_at: now }
          : // REMOVED is terminal. Nothing re-posts it, here or anywhere.
            { status: "REMOVED", removed_detected_at: now, last_verified_at: now, updated_at: now };

      const { data, error } = await admin
        .from("youtube_reply_recovery_attempts")
        .update(patch)
        .eq("id", rowId)
        // Only the row in the state the check was actually made against.
        .eq("status", fromStatus)
        .not("posted_reply_id", "is", null)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`Could not record the verification: ${error.message}`);
      return Boolean(data);
    },

    async recordEvent(input) {
      await recordRecoveryEvent({
        attemptId: id,
        eventType:
          input.verdict.result === "VERIFIED_LIVE"
            ? "RECOVERY_VERIFY_FOUND"
            : input.verdict.result === "REMOVED"
              ? "RECOVERY_VERIFY_NOT_FOUND"
              : "RECOVERY_VERIFY_INCONCLUSIVE",
        fromStatus: input.fromStatus,
        toStatus: input.verdict.result === "INCONCLUSIVE" ? input.fromStatus : input.verdict.result,
        actorUserId,
        youtubeReplyId: input.replyId,
        metadata: { result: input.verdict.result, detail: input.verdict.detail },
      });
    },
  };
}

/**
 * Check whether a reply we already sent is still live.
 *
 * Read-only against YouTube. API_ACCEPTED is not the same as live, and this is
 * the only thing that can tell the two apart.
 */
export async function confirmRecoveryReply(id: string, actorUserId: string): Promise<ConfirmOutcome> {
  return executeConfirmation(realConfirmDeps(id, actorUserId), id);
}

export { CLAIM_FROM_STATUS, CLAIM_TO_STATUS };
