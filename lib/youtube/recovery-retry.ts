/**
 * Human-authorized retry of a recovery attempt that DEFINITELY failed.
 *
 * Pure module: no `server-only`, no Supabase, no network. I/O injected.
 *
 * This is the narrow exception to "one attempt per row", and it is narrow on
 * purpose. A retry is only ever safe when we know the first attempt created
 * nothing. That is true for a definite rejection -- YouTube answered, and the
 * answer was no. It is NOT true for an unknown outcome, where the reply may
 * exist; retrying there is precisely how you post twice under someone's
 * comment, which is the harm this whole feature exists to prevent.
 *
 * So the ambiguous case is excluded structurally, not by policy: an unknown
 * outcome leaves the row in POSTING, and this path only accepts FAILED. It
 * then checks the row's own failure note and its event history as well, so a
 * row that reached FAILED by some other route still cannot slip through.
 *
 * A retry does not send. It returns the row to APPROVED -- the same state a
 * human review produces -- and the ordinary send path, with its own fresh
 * verification and atomic claim, runs afterwards as usual. Nothing here
 * bypasses a single check.
 */

import { classifyLookup, verifyChannel, type ChannelIdentity, type LookupOutcome } from "./recovery-verify";
import { RECOVERY_MAX_TOTAL_ATTEMPTS } from "./recovery-send";

export const RETRY_FROM_STATUS = "FAILED";
export const RETRY_TO_STATUS = "APPROVED";

/**
 * The marker `buildFailureNote` writes for an unknown outcome.
 *
 * Checked as a string because the note is the durable record of what happened;
 * a row whose stored note says the outcome was unknown must not be retried
 * even if its status somehow says FAILED.
 */
export const UNKNOWN_OUTCOME_MARKER = "OUTCOME UNKNOWN";

/**
 * What the audit trail can tell us about a prior unknown outcome.
 *
 * `clear`       -- the trail exists and shows no unresolved ambiguity.
 * `unresolved`  -- an unknown outcome was recorded and never resolved.
 * `unavailable` -- the trail could not be read, or is missing entries it must
 *                  have had. Treated exactly like `unresolved`: we cannot show
 *                  the first attempt created nothing, so we do not retry.
 */
export type AmbiguityEvidence = "clear" | "unresolved" | "unavailable";

export interface RetryRow {
  id: string;
  status: string;
  legacy_outcome: string;
  legacy_reply_id: string;
  posted_reply_id: string | null;
  attempt_count: number;
  last_error: string | null;
}

export type RetryRefusal =
  | "not_failed"
  | "already_posted"
  | "removal_unconfirmed"
  | "outcome_was_unknown"
  | "unresolved_ambiguity"
  | "ambiguity_evidence_unavailable"
  | "retry_limit_reached"
  | "fresh_still_live"
  | "fresh_api_error"
  | "fresh_ambiguous"
  | "channel_mismatch"
  | "transition_conflict";

/**
 * Stored state that permits authorizing a retry.
 *
 * Order is deliberate: the most serious facts are reported first, so a row
 * that is both already posted and not failed says "already posted".
 */
export function retryRefusal(row: RetryRow): RetryRefusal | null {
  if (row.posted_reply_id) return "already_posted";
  if (row.status !== RETRY_FROM_STATUS) return "not_failed";
  if (row.legacy_outcome !== "CONFIRMED_REMOVED") return "removal_unconfirmed";
  if (row.last_error && row.last_error.includes(UNKNOWN_OUTCOME_MARKER)) return "outcome_was_unknown";
  if (row.attempt_count >= RECOVERY_MAX_TOTAL_ATTEMPTS) return "retry_limit_reached";
  return null;
}

export function canRetryRecovery(row: RetryRow): boolean {
  return retryRefusal(row) === null;
}

export type RetryOutcome =
  | { ok: true; status: "APPROVED"; attemptCount: number; remainingAttempts: number }
  | { ok: false; reason: RetryRefusal | "not_found"; httpStatus: number; posted: false };

export interface RetryDeps {
  loadRow(id: string): Promise<RetryRow | null>;
  /**
   * What the event trail says about unresolved ambiguity on this row.
   *
   * Three answers, not two, because "the trail says nothing" and "the trail
   * says all clear" are different facts. A boolean collapses them and
   * collapses them the WRONG way: a missing table, a failed query or a row
   * that was attempted but has no events would all read as false, i.e. as
   * permission. So the unavailable case is explicit and it refuses.
   */
  ambiguityEvidence(id: string, row: RetryRow): Promise<AmbiguityEvidence>;
  authenticatedChannel(): Promise<ChannelIdentity>;
  lookupReply(legacyReplyId: string): Promise<LookupOutcome>;
  /**
   * Guarded transition FAILED -> APPROVED. MUST match only a row still FAILED,
   * unsent, and at the observed attempt count. Returns false if it did not
   * apply. Preserves attempt_count and last_error -- provenance is not erased.
   */
  authorize(id: string, expect: { status: string; attemptCount: number }): Promise<boolean>;
  recordEvent(input: {
    reason: RetryRefusal | null;
    previousAttemptCount: number;
    previousError: string | null;
  }): Promise<void>;
}

const refuse = (reason: RetryRefusal | "not_found", httpStatus: number): RetryOutcome => ({
  ok: false,
  reason,
  httpStatus,
  posted: false,
});

/**
 * Authorize one more attempt on a definitely-failed row.
 *
 * Re-runs the fresh exact-id verification before authorizing, so a row whose
 * legacy reply came back between the failure and the retry cannot be queued up
 * to post over it. The send path will verify again at send time -- that is not
 * redundant, it is the point: neither check substitutes for the other, and the
 * gap between authorizing and sending is exactly where things change.
 */
export async function executeRetryAuthorization(deps: RetryDeps, id: string): Promise<RetryOutcome> {
  const row = await deps.loadRow(id);
  if (!row) return refuse("not_found", 404);

  const stored = retryRefusal(row);
  if (stored) {
    await deps.recordEvent({
      reason: stored,
      previousAttemptCount: row.attempt_count,
      previousError: row.last_error,
    });
    return refuse(stored, 409);
  }

  const evidence = await deps.ambiguityEvidence(row.id, row);
  if (evidence !== "clear") {
    const reason: RetryRefusal =
      evidence === "unresolved" ? "unresolved_ambiguity" : "ambiguity_evidence_unavailable";
    await deps.recordEvent({
      reason,
      previousAttemptCount: row.attempt_count,
      previousError: row.last_error,
    });
    return refuse(reason, 409);
  }

  const verdict = verifyChannel(await deps.authenticatedChannel());
  if (!verdict.ok) return refuse("channel_mismatch", 502);

  const classification = classifyLookup(await deps.lookupReply(row.legacy_reply_id));
  if (classification.result !== "CONFIRMED_REMOVED") {
    const reason: RetryRefusal =
      classification.result === "STILL_LIVE"
        ? "fresh_still_live"
        : classification.result === "API_ERROR"
          ? "fresh_api_error"
          : "fresh_ambiguous";
    await deps.recordEvent({
      reason,
      previousAttemptCount: row.attempt_count,
      previousError: row.last_error,
    });
    return refuse(reason, classification.result === "STILL_LIVE" ? 409 : 503);
  }

  const applied = await deps.authorize(row.id, {
    status: RETRY_FROM_STATUS,
    attemptCount: row.attempt_count,
  });
  if (!applied) return refuse("transition_conflict", 409);

  await deps.recordEvent({
    reason: null,
    previousAttemptCount: row.attempt_count,
    previousError: row.last_error,
  });

  return {
    ok: true,
    status: RETRY_TO_STATUS,
    attemptCount: row.attempt_count,
    remainingAttempts: RECOVERY_MAX_TOTAL_ATTEMPTS - row.attempt_count,
  };
}

export const RECOVERY_RETRY_REFUSAL_TEXT: Record<string, string> = {
  not_found: "That recovery attempt does not exist",
  not_failed: "Only an attempt that definitely failed can be retried",
  already_posted: "A reply has already been sent for this attempt",
  removal_unconfirmed: "Removal of the legacy reply is not confirmed",
  outcome_was_unknown: "The previous outcome was unknown — resolve it before retrying",
  unresolved_ambiguity: "This attempt has an unresolved unknown outcome — resolve it first",
  ambiguity_evidence_unavailable:
    "The attempt history could not be read, so a previous unknown outcome cannot be ruled out",
  retry_limit_reached: "This attempt has used all permitted tries",
  fresh_still_live: "The legacy reply is live again — there is nothing to replace",
  fresh_api_error: "The removal check could not be completed — nothing was authorized",
  fresh_ambiguous: "The removal check was inconclusive — nothing was authorized",
  channel_mismatch: "These credentials do not belong to the expected channel",
  transition_conflict: "The attempt changed while it was being authorized",
};
