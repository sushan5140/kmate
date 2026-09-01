/**
 * Manual review rules for recovery attempts.
 *
 * Pure module: no `server-only`, no Supabase, no network. Deliberately a
 * SEPARATE file from lib/youtube/recovery.ts, which is the import-side parsing
 * and matching layer -- that file is left exactly as it was written, and this
 * one only adds the review verbs on top of it.
 *
 * The approval gate is not re-implemented here. It is `recoveryApproveRefusal`
 * from recovery.ts, imported and used verbatim, so the UI, the route and the
 * regression suite all consult one rule. A recovery attempt is a reply to a
 * comment whose previous reply YouTube already removed once, so approving one
 * is a claim that the removal is proven -- not a guess.
 *
 * Nothing in this file posts, and no verb here can reach a posted state.
 */

import {
  recoveryApproveRefusal,
  type RecoveryLegacyOutcome,
  type RecoveryStatus,
} from "./recovery";

/**
 * The only statuses a reviewer's verb may produce.
 *
 * POSTING, API_ACCEPTED, VERIFIED_LIVE, REMOVED and FAILED are all absent by
 * construction: they belong to a posting path this review layer does not have
 * and must not be reachable from a request body. The browser sends a verb; the
 * server maps it here.
 */
export const RECOVERY_DECISION_ACTIONS = {
  approve: "APPROVED",
  hold: "HOLD",
  skip: "SKIP",
  // Returns a held attempt to the undecided review state. It cannot reach
  // APPROVED directly -- a reviewer must look at the row again and approve it
  // as a separate act, so holding never becomes a shortcut around the
  // approval gate.
  unhold: "DRAFTED",
} as const;

export type RecoveryDecisionAction = keyof typeof RECOVERY_DECISION_ACTIONS;

export function isRecoveryDecisionAction(value: unknown): value is RecoveryDecisionAction {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(RECOVERY_DECISION_ACTIONS, value)
  );
}

/** The subset of a recovery row every rule below reasons about. */
export interface RecoveryRowFacts {
  status: RecoveryStatus;
  legacy_outcome: RecoveryLegacyOutcome;
  posted_reply_id: string | null;
}

export type RecoveryHoldSkipRefusal = "already_posted" | "in_flight" | "terminal";

export type RecoveryUnholdRefusal = "not_held" | "already_posted";

/**
 * Unhold applies to exactly one state: HOLD.
 *
 * Not "anything that is not drafted", and not "any undecided state" -- exactly
 * HOLD. A DRAFTED row is already where unhold would put it, and an APPROVED or
 * SKIP row reaching DRAFTED through this verb would be a status change wearing
 * the wrong name.
 */
export function recoveryUnholdRefusal(row: RecoveryRowFacts): RecoveryUnholdRefusal | null {
  if (row.posted_reply_id) return "already_posted";
  if (row.status !== "HOLD") return "not_held";
  return null;
}

export function canUnholdRecovery(row: RecoveryRowFacts): boolean {
  return recoveryUnholdRefusal(row) === null;
}

/**
 * Hold and Skip are the low-stakes verbs: neither sends anything, and both are
 * refused only where they would contradict something that already happened.
 *
 * Once a recovery attempt carries a posted reply id, or is mid-flight, its
 * state is a record of a real event and a reviewer may not relabel it.
 */
export function recoveryHoldSkipRefusal(row: RecoveryRowFacts): RecoveryHoldSkipRefusal | null {
  if (row.posted_reply_id) return "already_posted";
  if (row.status === "POSTING" || row.status === "API_ACCEPTED") return "in_flight";
  if (row.status === "VERIFIED_LIVE" || row.status === "REMOVED") return "terminal";
  return null;
}

export function canHoldOrSkipRecovery(row: RecoveryRowFacts): boolean {
  return recoveryHoldSkipRefusal(row) === null;
}

export type RecoveryDecisionRefusal =
  | ReturnType<typeof recoveryApproveRefusal>
  | RecoveryHoldSkipRefusal
  | RecoveryUnholdRefusal;

/**
 * Whether one verb may be applied to one row, and why not when it may not.
 *
 * Approval defers entirely to recoveryApproveRefusal: DRAFTED, legacy outcome
 * CONFIRMED_REMOVED, and no existing posted reply id. That is stricter than the
 * database CHECK (which permits APPROVED for any CONFIRMED_REMOVED row), and
 * deliberately so -- the database is the floor, not the policy.
 */
export function recoveryDecisionRefusal(
  action: RecoveryDecisionAction,
  row: RecoveryRowFacts
): RecoveryDecisionRefusal | null {
  if (action === "approve") return recoveryApproveRefusal(row);
  if (action === "unhold") return recoveryUnholdRefusal(row);
  return recoveryHoldSkipRefusal(row);
}

export function canApplyRecoveryDecision(
  action: RecoveryDecisionAction,
  row: RecoveryRowFacts
): boolean {
  return recoveryDecisionRefusal(action, row) === null;
}

/** Reviewer-facing wording for each refusal. */
export const RECOVERY_REFUSAL_TEXT: Record<string, string> = {
  not_drafted: "Only a drafted attempt can be approved",
  removal_unconfirmed: "Removal of the legacy reply is not confirmed",
  already_posted: "A reply has already been sent for this attempt",
  not_held: "Only a held attempt can be returned to review",
  in_flight: "A send is in flight",
  terminal: "This attempt has reached a final state",
};

export const RECOVERY_STATUS_LABELS: Record<RecoveryStatus, string> = {
  DRAFTED: "Drafted",
  APPROVED: "Approved — not sent",
  POSTING: "Posting…",
  API_ACCEPTED: "API accepted — unconfirmed",
  VERIFIED_LIVE: "Verified live",
  HOLD: "Hold",
  SKIP: "Skipped",
  REMOVED: "Removed by YouTube",
  FAILED: "Failed",
};

export const RECOVERY_LEGACY_OUTCOME_LABELS: Record<RecoveryLegacyOutcome, string> = {
  POSTED_RECORDED: "Legacy reply recorded as sent — removal NOT confirmed",
  CONFIRMED_REMOVED: "Legacy reply confirmed removed",
};

/**
 * Presentation grouping. APPROVED is deliberately not a success tone: an
 * approved recovery attempt has been reviewed, not sent, and this whole
 * feature exists because "accepted" was once mistaken for "live".
 */
export type RecoveryTone = "neutral" | "ready" | "pending" | "success" | "danger";

export function recoveryStatusTone(status: RecoveryStatus): RecoveryTone {
  switch (status) {
    case "VERIFIED_LIVE":
      return "success";
    case "APPROVED":
      return "ready";
    case "POSTING":
    case "API_ACCEPTED":
      return "pending";
    case "REMOVED":
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

/** Reads the recorded verification result out of stored legacy evidence. */
export function evidenceResult(evidence: Record<string, unknown> | null): string | null {
  const value = evidence?.result;
  return typeof value === "string" ? value : null;
}

export function evidenceCheckedAt(evidence: Record<string, unknown> | null): string | null {
  const value = evidence?.checked_at;
  return typeof value === "string" ? value : null;
}

export function evidenceMethod(evidence: Record<string, unknown> | null): string | null {
  const value = evidence?.verification_method;
  return typeof value === "string" ? value : null;
}

export function evidenceChannelId(evidence: Record<string, unknown> | null): string | null {
  const value = evidence?.authenticated_channel_id;
  return typeof value === "string" ? value : null;
}

export function evidenceNotes(evidence: Record<string, unknown> | null): string | null {
  const queue = evidence?.recovery_queue;
  if (queue && typeof queue === "object" && "notes" in queue) {
    const notes = (queue as { notes?: unknown }).notes;
    return typeof notes === "string" ? notes : null;
  }
  return null;
}
