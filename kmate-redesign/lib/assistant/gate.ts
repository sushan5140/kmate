import { AUTO_VERIFY_MIN_CONFIDENCE, autoVerifyEnabled } from "./config";
import type { DeadlineProposal } from "./schema";

/**
 * The auto-verify gate.
 *
 * Every condition must pass. There is no scoring, no "mostly passed", and no
 * override: a single unmet condition sends the proposal to a person. That is
 * the whole design -- the gate exists to clear the handful of unambiguous
 * cases off an admin's queue, not to maximise how many it can decide.
 *
 * The product rule this enforces, restated because it is easy to erode:
 * an approved notice does NOT create a deadline, and a candidate date does
 * NOT create a deadline. Only this gate passing in full, or an explicit admin
 * approval, may do that.
 */

export type GateDecision = "auto_verified" | "needs_review" | "rejected_not_deadline";

export interface GateContext {
  /** Has a human approved the underlying notice's metadata? */
  noticeApproved: boolean;
  /** Did the notice come from a registered official source? */
  officialSource: boolean;
  /** A verified deadline that already exists for this exact scope, if any. */
  existingVerifiedDate: string | null;
  /** Other candidate dates of the same kind on this notice. */
  conflictingCandidateDates: string[];
}

export interface GateResult {
  decision: GateDecision;
  /** Every condition that failed, in the order checked. Shown to the admin. */
  failed: string[];
  /** True when the gate would have passed but auto-verify is switched off. */
  suppressedByFlag: boolean;
}

/**
 * Evaluates a validated proposal against the full gate.
 *
 * `proposal` must already have passed `parseProposal`. A caller that skipped
 * validation has no business calling this, because the confidence and date
 * fields it reads would be untrusted.
 */
export function evaluateGate(proposal: DeadlineProposal, ctx: GateContext): GateResult {
  // A clean "this is not a deadline" is a decision in its own right, not a
  // failure -- it still records the evidence, it just never becomes a date.
  if (proposal.classification === "not_deadline") {
    return { decision: "rejected_not_deadline", failed: [], suppressedByFlag: false };
  }

  const failed: string[] = [];

  if (!ctx.noticeApproved) failed.push("the underlying notice has not been approved by a reviewer");
  if (!ctx.officialSource) failed.push("the notice did not come from a registered official source");
  if (proposal.classification !== "deadline") failed.push(`classification is "${proposal.classification}", not "deadline"`);
  if (proposal.confidence < AUTO_VERIFY_MIN_CONFIDENCE) {
    failed.push(`confidence ${proposal.confidence} is below the ${AUTO_VERIFY_MIN_CONFIDENCE} threshold`);
  }
  if (!proposal.date) failed.push("no explicit full date");
  if (!proposal.evidence) failed.push("no evidence quoted from the source");
  if (proposal.cycle === null) failed.push("the cycle is not clear");
  if (proposal.program === null) failed.push("the programme is not clear");
  if (proposal.deadline_type === null) failed.push("the deadline type is not clear");
  if (proposal.scope_type === null) failed.push("the scope is not clear");

  // A country- or university-scoped deadline must actually name the thing it
  // is scoped to, otherwise the scope is a label with nothing behind it.
  if (proposal.scope_type === "country" && !proposal.country) failed.push("country scope with no country named");
  if (proposal.scope_type === "university" && !proposal.university) failed.push("university scope with no university named");

  if (ctx.conflictingCandidateDates.length > 0) {
    failed.push(`the notice states conflicting dates of this kind (${ctx.conflictingCandidateDates.join(", ")})`);
  }
  // Superseding an existing verified deadline is never automatic. Even an
  // explicit extension goes to a person the first time.
  if (ctx.existingVerifiedDate && ctx.existingVerifiedDate !== proposal.date) {
    failed.push(`a different verified deadline already exists for this scope (${ctx.existingVerifiedDate})`);
  }

  // NOTE: track is deliberately NOT required. A notice that genuinely applies
  // across both tracks states no track, and forcing one would invent scope.

  if (failed.length > 0) return { decision: "needs_review", failed, suppressedByFlag: false };

  // Gate passed on the merits. The flag decides whether that becomes a write.
  if (!autoVerifyEnabled()) {
    return { decision: "needs_review", failed: [], suppressedByFlag: true };
  }
  return { decision: "auto_verified", failed: [], suppressedByFlag: false };
}
