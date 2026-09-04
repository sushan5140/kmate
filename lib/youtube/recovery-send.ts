/**
 * The rules and the orchestration for sending ONE approved recovery attempt.
 *
 * Pure module: no `server-only`, no Supabase, no network, no clock of its own.
 * Every decision lives here, and the I/O is injected, so the whole send flow --
 * including the race, the failure branches and the "never post" paths -- can be
 * driven directly by the regression suite with fakes. `recovery-post.ts` is the
 * thin server wiring that supplies the real database and YouTube calls.
 *
 * The property this file exists to protect: a recovery attempt replaces a reply
 * YouTube already removed once. Sending one is a claim that the old reply is
 * gone RIGHT NOW -- not that it was gone in September. So the stored
 * verification evidence is provenance only, and a fresh exact-id check runs
 * immediately before the claim. Anything short of "HTTP 200, items array,
 * empty" blocks the send, including every flavour of failure. "We do not know"
 * is never permission to post.
 */

import {
  classifyLookup,
  verifyChannel,
  type ChannelIdentity,
  type LookupOutcome,
  type VerificationResult,
} from "./recovery-verify";
import type { RecoveryEventType } from "./recovery-events";

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/**
 * Why a send did not happen. Every one of these means NOTHING was sent.
 *
 * Split into three groups by where they are decided: from stored state before
 * any network call, from the fresh verification, and from the atomic claim.
 */
export type RecoverySendRefusal =
  // stored state
  | "not_approved"
  | "already_posted"
  | "attempt_exhausted"
  | "removal_unconfirmed"
  // fresh verification
  | "fresh_still_live"
  | "fresh_api_error"
  | "fresh_ambiguous"
  | "channel_mismatch"
  // claim
  | "claim_conflict"
  | "claim_state_drift";

/**
 * How many times one row may EVER be claimed for sending, across all attempts.
 *
 * Two: the first send, plus at most one human-authorized retry.
 *
 * The number is not what prevents an automatic retry -- the STATUS is. A row
 * that has been attempted is FAILED or POSTING, never APPROVED, and only
 * `recovery-retry.ts` can return a definitely-failed row to APPROVED, after a
 * person asks for it and a fresh verification passes. This cap is the second
 * fence: even with authorization, a row cannot be tried a third time, so a
 * mistake in the retry path cannot become an unbounded loop.
 *
 * Two rather than more because the only retryable case is a definite
 * rejection, and a rejection that repeats is telling us something a third
 * attempt will not fix.
 */
export const RECOVERY_MAX_TOTAL_ATTEMPTS = 2;

/** The status a row must be in to be claimed, and the status a claim moves it to. */
export const CLAIM_FROM_STATUS = "APPROVED";
export const CLAIM_TO_STATUS = "POSTING";

export interface RecoverySendRow {
  id: string;
  status: string;
  legacy_outcome: string;
  legacy_reply_id: string;
  youtube_comment_id: string;
  draft_text: string;
  posted_reply_id: string | null;
  attempt_count: number;
}

/**
 * Whether stored state permits attempting a send, checked before any network
 * call so an ineligible row never reaches YouTube at all.
 *
 * Deliberately NOT a re-implementation of the approval gate: approval already
 * happened and is recorded as the APPROVED status. What this adds is that the
 * row is still approved, still unsent, and has not used up its attempts.
 *
 * Note what does the real work of preventing a re-send: the status check. A
 * row that has been attempted is FAILED or POSTING, so it cannot reach here
 * again unless a human explicitly authorized a retry.
 */
export function recoverySendRefusal(row: RecoverySendRow): RecoverySendRefusal | null {
  if (row.posted_reply_id) return "already_posted";
  if (row.status !== CLAIM_FROM_STATUS) return "not_approved";
  // Belt and braces. The DB CHECK and the approval gate both enforce this
  // already; a row reaching the send path without it means something upstream
  // is wrong, and the send path is the wrong place to be forgiving.
  if (row.legacy_outcome !== "CONFIRMED_REMOVED") return "removal_unconfirmed";
  if (row.attempt_count >= RECOVERY_MAX_TOTAL_ATTEMPTS) return "attempt_exhausted";
  return null;
}

export function canSendRecovery(row: RecoverySendRow): boolean {
  return recoverySendRefusal(row) === null;
}

/**
 * The fresh check's verdict, as a send decision.
 *
 * Only CONFIRMED_REMOVED clears. STILL_LIVE means the reply we are replacing
 * is still there, so there is nothing to recover. API_ERROR and AMBIGUOUS mean
 * we could not establish that it is gone, and posting on "could not establish"
 * is how you end up replying twice under someone's comment.
 */
export function freshVerificationRefusal(result: VerificationResult): RecoverySendRefusal | null {
  switch (result) {
    case "CONFIRMED_REMOVED":
      return null;
    case "STILL_LIVE":
      return "fresh_still_live";
    case "API_ERROR":
      return "fresh_api_error";
    case "AMBIGUOUS":
      return "fresh_ambiguous";
  }
}

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

export interface RecoverySendPayload {
  parentId: string;
  text: string;
}

/**
 * The exact bytes that will be sent, derived ONLY from the stored row.
 *
 * There is no parameter for caller-supplied content, because a signature that
 * cannot accept request data cannot be tricked into sending it. The route
 * receives a row id and an action verb; everything else is read from the
 * database after authorization.
 */
export function buildSendPayload(row: RecoverySendRow): RecoverySendPayload {
  return { parentId: row.youtube_comment_id, text: row.draft_text };
}

export class PayloadIntegrityError extends Error {
  constructor(field: string) {
    super(`Refusing to send: ${field} does not match the stored approved row.`);
    this.name = "PayloadIntegrityError";
  }
}

/**
 * Re-checks, immediately before the insert, that the payload is still exactly
 * the approved row's own content.
 *
 * The row is re-read after the claim, so this catches the case where the text
 * or the parent changed between the eligibility check and the send.
 */
export function assertPayloadMatchesRow(payload: RecoverySendPayload, row: RecoverySendRow): void {
  if (payload.text !== row.draft_text) throw new PayloadIntegrityError("draft_text");
  if (payload.parentId !== row.youtube_comment_id) throw new PayloadIntegrityError("youtube_comment_id");
}

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

/**
 * What to do with a row after the insert threw.
 *
 * `definite_rejection` -- YouTube answered, and the answer was no. Nothing was
 * created, so the row is FAILED and a human decides what happens next.
 *
 * `outcome_unknown` -- the request died in flight, or was accepted without a
 * usable id. It is NOT known whether the reply exists. The row stays POSTING:
 * no status claims success, no status claims failure, nothing can re-claim it,
 * and a person has to look. This is the branch that must never quietly become
 * a retry.
 */
export type SendFailureDisposition = "definite_rejection" | "outcome_unknown";

export interface SendErrorFacts {
  code: string;
  message: string;
  httpStatus?: number | null;
  outcomeUnknown?: boolean;
}

export function classifySendFailure(error: SendErrorFacts): SendFailureDisposition {
  return error.outcomeUnknown ? "outcome_unknown" : "definite_rejection";
}

/** Status a row lands in after a failure. `null` means "leave it claimed". */
export function failureStatus(disposition: SendFailureDisposition): "FAILED" | null {
  return disposition === "definite_rejection" ? "FAILED" : null;
}

/**
 * The note stored on the row after a failure.
 *
 * Google's message names the API-level problem and carries no credential
 * material. For the unknown case the text says so in words, because the row
 * is left mid-flight and whoever finds it needs to know that re-sending could
 * duplicate a reply that may already exist.
 */
export function buildFailureNote(
  error: SendErrorFacts,
  disposition: SendFailureDisposition,
  at: string
): string {
  const status = error.httpStatus === null || error.httpStatus === undefined ? "-" : error.httpStatus;
  const head = `[${at}] ${error.code} (http ${status}): ${error.message}`;
  return disposition === "outcome_unknown"
    ? `${head} — OUTCOME UNKNOWN: it is not known whether YouTube created this reply. Do not re-send. Verify the parent comment by hand before any further action.`
    : head;
}

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------

export type RecoverySendOutcome =
  | { ok: true; status: "API_ACCEPTED"; postedReplyId: string }
  | { ok: false; reason: RecoverySendRefusal | "not_found"; httpStatus: number; posted: false }
  | {
      ok: false;
      reason: "send_failed";
      disposition: SendFailureDisposition;
      status: "FAILED" | "POSTING";
      note: string;
      httpStatus: number;
      posted: false;
    };

/**
 * The I/O the flow needs. Injected so the regression suite can drive every
 * branch -- including two racing claims -- without a database or a network.
 */
export interface RecoverySendDeps {
  /** The row as stored, or null. */
  loadRow(id: string): Promise<RecoverySendRow | null>;
  /** Identity of the credentials being used. */
  authenticatedChannel(): Promise<ChannelIdentity>;
  /** A raw exact-id comments.list result, unclassified. */
  lookupReply(legacyReplyId: string): Promise<LookupOutcome>;
  /**
   * Conditional claim. MUST apply only when the row is still APPROVED, unsent,
   * and at the attempt count observed. Returns the claimed row, or null when
   * another caller got there first.
   */
  claim(id: string, expect: { status: string; attemptCount: number }): Promise<RecoverySendRow | null>;
  /** The one side-effecting call. Throws SendErrorFacts-shaped errors. */
  insertReply(payload: RecoverySendPayload): Promise<{ replyId: string }>;
  /** Records success. */
  recordAccepted(id: string, replyId: string): Promise<void>;
  /** Records a failure. `status` null leaves the row claimed (POSTING). */
  recordFailure(id: string, status: "FAILED" | null, note: string): Promise<void>;
  /**
   * Appends one audit event. Must never throw into the send flow: an audit
   * outage is worth knowing about, but it must not undo or block a real post.
   */
  recordEvent(input: {
    type: RecoveryEventType;
    fromStatus?: string | null;
    toStatus?: string | null;
    youtubeReplyId?: string | null;
    attemptNumber?: number | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  now(): string;
}

const refuse = (reason: RecoverySendRefusal | "not_found", httpStatus: number): RecoverySendOutcome => ({
  ok: false,
  reason,
  httpStatus,
  posted: false,
});

/**
 * Send one approved recovery attempt, or refuse and send nothing.
 *
 * The order is the safety property, not an implementation detail:
 *
 *   1. stored eligibility   -- an ineligible row never touches the network
 *   2. channel identity     -- never post as the wrong account
 *   3. FRESH exact-id check -- the stored evidence is provenance, not licence
 *   4. atomic claim         -- exactly one caller may proceed
 *   5. re-read + re-assert  -- the claimed row is still what we verified
 *   6. insert               -- the only side effect in this file's reach
 *
 * Steps 3 and 4 are in that order on purpose: verifying before claiming means
 * a row that fails verification is never moved out of APPROVED, so a blocked
 * send leaves no trace to clean up. The claim then re-checks the state the
 * verification was made against, so the window between them cannot be used.
 */
export async function executeRecoverySend(
  deps: RecoverySendDeps,
  id: string
): Promise<RecoverySendOutcome> {
  const row = await deps.loadRow(id);
  if (!row) return refuse("not_found", 404);

  await deps.recordEvent({
    type: "RECOVERY_SEND_REQUESTED",
    fromStatus: row.status,
    attemptNumber: row.attempt_count + 1,
    metadata: { parent_comment_id: row.youtube_comment_id, legacy_reply_id: row.legacy_reply_id },
  });

  const storedRefusal = recoverySendRefusal(row);
  if (storedRefusal) return refuse(storedRefusal, 409);

  // 2. Whose channel are these credentials? Wrong answer aborts before any
  // per-row work, and a missing/unreadable identity is a mismatch, not a pass.
  const verdict = verifyChannel(await deps.authenticatedChannel());
  if (!verdict.ok) {
    await deps.recordEvent({
      type: "RECOVERY_FRESH_VERIFICATION_BLOCKED",
      fromStatus: row.status,
      metadata: { reason: "channel_mismatch" },
    });
    return refuse("channel_mismatch", 502);
  }

  // 3. The fresh check. Stored evidence is not consulted here at all.
  const classification = classifyLookup(await deps.lookupReply(row.legacy_reply_id));
  const freshRefusal = freshVerificationRefusal(classification.result);
  if (freshRefusal) {
    await deps.recordEvent({
      type: "RECOVERY_FRESH_VERIFICATION_BLOCKED",
      fromStatus: row.status,
      metadata: {
        result: classification.result,
        detail: classification.detail,
        legacy_reply_id: row.legacy_reply_id,
      },
    });
    return refuse(freshRefusal, classification.result === "STILL_LIVE" ? 409 : 503);
  }
  await deps.recordEvent({
    type: "RECOVERY_FRESH_VERIFICATION_PASSED",
    fromStatus: row.status,
    metadata: { result: classification.result, legacy_reply_id: row.legacy_reply_id },
  });

  // 4. Only one caller can win this.
  const claimed = await deps.claim(row.id, {
    status: CLAIM_FROM_STATUS,
    attemptCount: row.attempt_count,
  });
  if (!claimed) return refuse("claim_conflict", 409);
  await deps.recordEvent({
    type: "RECOVERY_POST_CLAIMED",
    fromStatus: CLAIM_FROM_STATUS,
    toStatus: CLAIM_TO_STATUS,
    attemptNumber: claimed.attempt_count,
    metadata: { parent_comment_id: claimed.youtube_comment_id },
  });

  // 5. The claim returns the row as it now stands. If anything the verification
  // depended on moved, stop -- claimed but unsent is recoverable, sent on stale
  // facts is not.
  if (
    claimed.status !== CLAIM_TO_STATUS ||
    claimed.posted_reply_id !== null ||
    claimed.legacy_reply_id !== row.legacy_reply_id
  ) {
    return refuse("claim_state_drift", 409);
  }

  const payload = buildSendPayload(claimed);
  assertPayloadMatchesRow(payload, claimed);

  // 6. The side effect.
  try {
    const { replyId } = await deps.insertReply(payload);
    await deps.recordAccepted(claimed.id, replyId);
    await deps.recordEvent({
      type: "RECOVERY_API_ACCEPTED",
      fromStatus: CLAIM_TO_STATUS,
      toStatus: "API_ACCEPTED",
      youtubeReplyId: replyId,
      attemptNumber: claimed.attempt_count,
      metadata: { parent_comment_id: claimed.youtube_comment_id },
    });
    return { ok: true, status: "API_ACCEPTED", postedReplyId: replyId };
  } catch (error) {
    const facts: SendErrorFacts =
      error && typeof error === "object" && "code" in error
        ? (error as SendErrorFacts)
        : { code: "unknown", message: error instanceof Error ? error.message : "Unknown send error" };

    const disposition = classifySendFailure(facts);
    const status = failureStatus(disposition);
    const note = buildFailureNote(facts, disposition, deps.now());
    await deps.recordFailure(claimed.id, status, note);
    await deps.recordEvent({
      type: disposition === "outcome_unknown" ? "RECOVERY_OUTCOME_UNKNOWN" : "RECOVERY_API_REJECTED",
      fromStatus: CLAIM_TO_STATUS,
      toStatus: status ?? CLAIM_TO_STATUS,
      attemptNumber: claimed.attempt_count,
      metadata: {
        reason: facts.code,
        disposition,
        http_status: facts.httpStatus ?? null,
        parent_comment_id: claimed.youtube_comment_id,
      },
    });

    return {
      ok: false,
      reason: "send_failed",
      disposition,
      status: status ?? CLAIM_TO_STATUS,
      note,
      // 502 for a definite rejection; 500 for "we do not know", because that
      // one needs a human and should not read as a routine failure.
      httpStatus: disposition === "outcome_unknown" ? 500 : 502,
      posted: false,
    };
  }
}

/** Reviewer-facing wording for each refusal. */
export const RECOVERY_SEND_REFUSAL_TEXT: Record<string, string> = {
  not_found: "That recovery attempt does not exist",
  not_approved: "Only an approved attempt can be sent",
  already_posted: "A reply has already been sent for this attempt",
  attempt_exhausted: "This attempt has already been tried once and needs a human decision",
  removal_unconfirmed: "Removal of the legacy reply is not confirmed",
  fresh_still_live: "The legacy reply is still live right now — there is nothing to replace",
  fresh_api_error: "The removal check could not be completed — nothing was sent",
  fresh_ambiguous: "The removal check was inconclusive — nothing was sent",
  channel_mismatch: "These credentials do not belong to the expected channel",
  claim_conflict: "Another request is already sending this attempt",
  claim_state_drift: "The attempt changed while it was being prepared — nothing was sent",
  send_failed: "YouTube did not accept the reply",
};
