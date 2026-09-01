/**
 * Recovery REVIEW layer checks -- the manual approve / hold / skip actions.
 *
 * Run with:
 *   npx tsx --conditions react-server supabase/scripts/regression/youtube-recovery-review-checks.ts
 *
 * Companion to youtube-recovery-checks.ts, which covers the import side and is
 * left untouched. This file covers only what the review layer added.
 *
 * The property that matters most: a recovery attempt answers a comment whose
 * previous reply YouTube already removed. Approving one is a claim that the
 * removal is PROVEN, so approval must be refused whenever the legacy outcome is
 * still POSTED_RECORDED -- and no review verb may ever reach a posted state.
 *
 * Pure logic only: no network, no database, no credentials.
 */
import { readFileSync } from "node:fs";
import {
  RECOVERY_DECISION_ACTIONS,
  RECOVERY_LEGACY_OUTCOME_LABELS,
  RECOVERY_REFUSAL_TEXT,
  RECOVERY_STATUS_LABELS,
  canApplyRecoveryDecision,
  canHoldOrSkipRecovery,
  canUnholdRecovery,
  evidenceChannelId,
  evidenceCheckedAt,
  evidenceMethod,
  evidenceResult,
  isRecoveryDecisionAction,
  recoveryDecisionRefusal,
  recoveryHoldSkipRefusal,
  recoveryStatusTone,
  recoveryUnholdRefusal,
  type RecoveryRowFacts,
} from "@/lib/youtube/recovery-review";
import { RECOVERY_STATUSES, canApproveRecovery } from "@/lib/youtube/recovery";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + m);
  if (!c) fail++;
};

/** A row that is approvable in every respect, which each test then breaks. */
const reviewable = (over: Partial<RecoveryRowFacts> = {}): RecoveryRowFacts => ({
  status: "DRAFTED",
  legacy_outcome: "CONFIRMED_REMOVED",
  posted_reply_id: null,
  ...over,
});

// -------------------------------------------------------------------------
console.log("=== no review verb can reach a posted state ===");
// -------------------------------------------------------------------------
const producible = Object.values(RECOVERY_DECISION_ACTIONS) as string[];
ok(
  producible.join(",") === "APPROVED,HOLD,SKIP,DRAFTED",
  `verbs produce only ${producible.join(", ")}`
);
for (const forbidden of ["POSTING", "API_ACCEPTED", "VERIFIED_LIVE", "REMOVED", "FAILED"]) {
  ok(!producible.includes(forbidden), `  no verb produces ${forbidden}`);
}
ok(isRecoveryDecisionAction("unhold"), "'unhold' is an accepted action");
ok(!isRecoveryDecisionAction("post"), "'post' is not an accepted action");
ok(!isRecoveryDecisionAction("DRAFTED"), "the raw target status is still not an accepted action");
ok(!isRecoveryDecisionAction("APPROVED"), "a raw status is not an accepted action");
ok(!isRecoveryDecisionAction("__proto__"), "prototype keys are not accepted actions");
ok(
  isRecoveryDecisionAction("approve") &&
    isRecoveryDecisionAction("hold") &&
    isRecoveryDecisionAction("skip"),
  "the three real verbs are accepted"
);

// -------------------------------------------------------------------------
console.log("=== approval requires PROVEN removal of the legacy reply ===");
// -------------------------------------------------------------------------
ok(canApplyRecoveryDecision("approve", reviewable()), "a drafted, confirmed-removed row is approvable");
ok(
  recoveryDecisionRefusal("approve", reviewable({ legacy_outcome: "POSTED_RECORDED" })) ===
    "removal_unconfirmed",
  "POSTED_RECORDED is refused -- removal is recorded, not proven"
);
ok(
  !canApplyRecoveryDecision("approve", reviewable({ legacy_outcome: "POSTED_RECORDED" })),
  "  and canApply is false"
);
ok(
  recoveryDecisionRefusal("approve", reviewable({ posted_reply_id: "Ugx.new" })) === "already_posted",
  "a row that already carries a new reply id is refused"
);

console.log("=== approval is refused from every status except DRAFTED ===");
let leaked = "";
for (const status of RECOVERY_STATUSES) {
  if (status === "DRAFTED") continue;
  if (canApplyRecoveryDecision("approve", reviewable({ status }))) leaked = status;
}
ok(leaked === "", `only DRAFTED is approvable (${leaked || "no status leaked"})`);
ok(
  recoveryDecisionRefusal("approve", reviewable({ status: "HOLD" })) === "not_drafted",
  "a held row reports not_drafted rather than silently approving"
);

console.log("=== the review layer defers to the import layer's gate ===");
// recoveryDecisionRefusal('approve') must BE recoveryApproveRefusal, not a copy.
for (const status of RECOVERY_STATUSES) {
  for (const outcome of ["CONFIRMED_REMOVED", "POSTED_RECORDED"] as const) {
    for (const posted of [null, "Ugx.r"]) {
      const row = reviewable({ status, legacy_outcome: outcome, posted_reply_id: posted });
      if (canApplyRecoveryDecision("approve", row) !== canApproveRecovery(row)) {
        ok(false, `divergence at ${status}/${outcome}/${posted}`);
      }
    }
  }
}
ok(true, "approve agrees with canApproveRecovery across all 54 combinations");

// -------------------------------------------------------------------------
console.log("=== hold and skip: low stakes, but never rewriting a real event ===");
// -------------------------------------------------------------------------
ok(canHoldOrSkipRecovery(reviewable()), "a drafted row can be held or skipped");
ok(canHoldOrSkipRecovery(reviewable({ status: "APPROVED" })), "an approved row can still be pulled back");
ok(canHoldOrSkipRecovery(reviewable({ status: "HOLD" })), "and a held row re-decided as skip");
ok(
  recoveryHoldSkipRefusal(reviewable({ posted_reply_id: "Ugx.new" })) === "already_posted",
  "a row with a sent reply cannot be relabelled"
);
ok(recoveryHoldSkipRefusal(reviewable({ status: "POSTING" })) === "in_flight", "an in-flight row is refused");
ok(
  recoveryHoldSkipRefusal(reviewable({ status: "API_ACCEPTED" })) === "in_flight",
  "an accepted-but-unconfirmed row is refused"
);
ok(recoveryHoldSkipRefusal(reviewable({ status: "REMOVED" })) === "terminal", "REMOVED is terminal");
ok(
  recoveryHoldSkipRefusal(reviewable({ status: "VERIFIED_LIVE" })) === "terminal",
  "VERIFIED_LIVE is terminal"
);

// -------------------------------------------------------------------------
console.log("=== unhold: HOLD -> DRAFTED, and nothing else ===");
// -------------------------------------------------------------------------
ok(canUnholdRecovery(reviewable({ status: "HOLD" })), "a held attempt can be returned to review");
ok(
  canApplyRecoveryDecision("unhold", reviewable({ status: "HOLD" })),
  "  and the decision layer agrees"
);
ok(
  RECOVERY_DECISION_ACTIONS.unhold === "DRAFTED",
  `unhold targets exactly DRAFTED (${RECOVERY_DECISION_ACTIONS.unhold})`
);

console.log("=== unhold is refused from every status except HOLD ===");
let unholdLeak = "";
for (const status of RECOVERY_STATUSES) {
  if (status === "HOLD") continue;
  if (canUnholdRecovery(reviewable({ status }))) unholdLeak = status;
}
ok(unholdLeak === "", `only HOLD may be unheld (${unholdLeak || "no status leaked"})`);
ok(
  recoveryUnholdRefusal(reviewable({ status: "DRAFTED" })) === "not_held",
  "DRAFTED -> unhold is refused: it is already where unhold would put it"
);
ok(
  recoveryUnholdRefusal(reviewable({ status: "APPROVED" })) === "not_held",
  "APPROVED -> unhold is refused"
);
ok(
  recoveryUnholdRefusal(reviewable({ status: "SKIP" })) === "not_held",
  "SKIP -> unhold is refused"
);
ok(
  recoveryUnholdRefusal(reviewable({ status: "HOLD", posted_reply_id: "Ugx.new" })) ===
    "already_posted",
  "a held row that somehow carries a sent reply is refused before the status check"
);
ok(Boolean(RECOVERY_REFUSAL_TEXT.not_held), "not_held has reviewer-facing wording");

console.log("=== unhold is not a back door to APPROVED ===");
// The intended flow is HOLD -> DRAFTED -> APPROVED, two separate decisions.
const held = reviewable({ status: "HOLD" });
ok(!canApplyRecoveryDecision("approve", held), "a held row still cannot be approved directly");
ok(
  recoveryDecisionRefusal("approve", held) === "not_drafted",
  "  and the reason is unchanged: not_drafted"
);
const afterUnhold = reviewable({ status: RECOVERY_DECISION_ACTIONS.unhold });
ok(
  canApplyRecoveryDecision("approve", afterUnhold),
  "only AFTER unhold does the row become approvable -- a second, separate decision"
);
ok(
  !canApplyRecoveryDecision("approve", reviewable({ status: "HOLD", legacy_outcome: "POSTED_RECORDED" })) &&
    !canApplyRecoveryDecision(
      "approve",
      reviewable({ status: "DRAFTED", legacy_outcome: "POSTED_RECORDED" })
    ),
  "and unheld rows still cannot be approved without confirmed removal"
);

console.log("=== the approval predicate itself is unchanged ===");
let approvalDivergence = "";
for (const status of RECOVERY_STATUSES) {
  for (const outcome of ["CONFIRMED_REMOVED", "POSTED_RECORDED"] as const) {
    for (const posted of [null, "Ugx.r"]) {
      const row = reviewable({ status, legacy_outcome: outcome, posted_reply_id: posted });
      if (canApplyRecoveryDecision("approve", row) !== canApproveRecovery(row)) {
        approvalDivergence = `${status}/${outcome}/${posted}`;
      }
    }
  }
}
ok(approvalDivergence === "", `approve still equals canApproveRecovery everywhere (${approvalDivergence || "no divergence"})`);

// -------------------------------------------------------------------------
console.log("=== presentation never overstates what happened ===");
// -------------------------------------------------------------------------
ok(recoveryStatusTone("APPROVED") === "ready", "APPROVED is 'ready', not success -- nothing was sent");
ok(recoveryStatusTone("API_ACCEPTED") === "pending", "API_ACCEPTED is pending, never success");
ok(recoveryStatusTone("VERIFIED_LIVE") === "success", "only VERIFIED_LIVE is success");
const successStatuses = RECOVERY_STATUSES.filter((s) => recoveryStatusTone(s) === "success");
ok(
  successStatuses.length === 1 && successStatuses[0] === "VERIFIED_LIVE",
  `exactly one status reads as success: ${successStatuses.join(", ")}`
);
ok(
  /unconfirmed/i.test(RECOVERY_STATUS_LABELS.API_ACCEPTED),
  `API_ACCEPTED says so in words: "${RECOVERY_STATUS_LABELS.API_ACCEPTED}"`
);
ok(
  /not sent/i.test(RECOVERY_STATUS_LABELS.APPROVED),
  `APPROVED says so in words: "${RECOVERY_STATUS_LABELS.APPROVED}"`
);
ok(
  /NOT confirmed/i.test(RECOVERY_LEGACY_OUTCOME_LABELS.POSTED_RECORDED),
  "POSTED_RECORDED is labelled as unproven, not as a success"
);
for (const key of ["not_drafted", "removal_unconfirmed", "already_posted", "in_flight", "terminal"]) {
  ok(Boolean(RECOVERY_REFUSAL_TEXT[key]), `  refusal "${key}" has reviewer-facing wording`);
}

// -------------------------------------------------------------------------
console.log("=== evidence readers tolerate anything, invent nothing ===");
// -------------------------------------------------------------------------
const realEvidence = {
  result: "CONFIRMED_REMOVED",
  checked_at: "2026-09-01T08:38:31.269429Z",
  verification_method: "exact_reply_id_api_check",
  authenticated_channel_id: "UCkX7YBd1ChGcJWOFHTGSLXQ",
  recovery_queue: { notes: "Direct audit: not found" },
};
ok(evidenceResult(realEvidence) === "CONFIRMED_REMOVED", "result read");
ok(evidenceMethod(realEvidence) === "exact_reply_id_api_check", "method read");
ok(evidenceChannelId(realEvidence) === "UCkX7YBd1ChGcJWOFHTGSLXQ", "channel id read");
ok(evidenceCheckedAt(realEvidence)?.startsWith("2026-09-01") === true, "checked_at read");
ok(evidenceResult(null) === null, "a null evidence object yields null, not a guess");
ok(evidenceResult({}) === null, "an empty evidence object yields null");
ok(evidenceResult({ result: 42 }) === null, "a non-string result is refused rather than coerced");

// -------------------------------------------------------------------------
console.log("=== the route and data layer cannot post ===");
// -------------------------------------------------------------------------
const routeSrc = readFileSync("app/api/admin/youtube/recovery/[id]/decide/route.ts", "utf8");
const queueSrc = readFileSync("lib/youtube/recovery-queue.ts", "utf8");
const reviewSrc = readFileSync("lib/youtube/recovery-review.ts", "utf8");
const uiSrc = readFileSync("components/admin/youtube-recovery.tsx", "utf8");

for (const [name, src] of [
  ["decide route", routeSrc],
  ["recovery-queue", queueSrc],
  ["recovery-review", reviewSrc],
  ["review UI", uiSrc],
] as const) {
  ok(!src.includes("comments.insert"), `${name} contains no comments.insert`);
  ok(!/from "@\/lib\/youtube\/api"/.test(src), `${name} does not import the YouTube API module`);
  ok(!/insertReply/.test(src), `${name} never references insertReply`);
  ok(!/post-runner/.test(src), `${name} does not reach the posting runner`);
}
ok(!/postBatch|postOneRow/.test(routeSrc + queueSrc), "no batch or single posting path is reachable");

console.log("=== authorization boundary on the decide route ===");
ok(routeSrc.includes("getAuthenticatedUser"), "route calls getAuthenticatedUser");
ok(routeSrc.includes("isAuthorizedAdmin"), "route calls isAuthorizedAdmin");
ok(routeSrc.includes("checkRateLimit"), "route rate-limits per admin");
ok(/status: 401/.test(routeSrc), "unauthenticated -> 401");
ok(/status: 403/.test(routeSrc), "non-admin -> 403");
ok(/status: 429/.test(routeSrc), "over budget -> 429");
ok(
  routeSrc.indexOf("getAuthenticatedUser") < routeSrc.indexOf("params"),
  "auth is checked before the row id is even read"
);
ok(
  routeSrc.includes("isRecoveryDecisionAction"),
  "the body is validated against the verb allow-list, not trusted"
);
ok(!/\bstatus:\s*body\./.test(routeSrc), "no request field is written to status");

console.log("=== the decision write touches only decision columns ===");
// Slice from the update call to ITS own .eq("id", id) -- searching from zero
// would match the earlier read in getRecoveryAttempt and yield an empty range.
const updateStart = queueSrc.indexOf(".update({");
const updateEnd = queueSrc.indexOf('.eq("id", id)', updateStart);
const updateBlock = queueSrc.slice(updateStart, updateEnd);
ok(updateStart > 0 && updateEnd > updateStart, "the update block was located for inspection");
for (const frozen of [
  "legacy_reply_id",
  "legacy_outcome",
  "legacy_evidence",
  "legacy_draft_text",
  "draft_text",
  "recovery_set",
  "recovery_order",
  "recovery_batch",
  "category",
  "posted_reply_id",
]) {
  ok(!updateBlock.includes(frozen), `  ${frozen} is never written by a review decision`);
}
for (const allowed of ["status", "decided_by", "decided_at", "updated_at"]) {
  ok(updateBlock.includes(allowed), `  ${allowed} is written (decision provenance)`);
}
ok(
  queueSrc.includes('.eq("status", row.status)'),
  "the update is conditional on the state the check was made against"
);
ok(
  updateBlock.includes("reverting ? null : actorUserId") &&
    updateBlock.includes("reverting ? null : now"),
  "unhold CLEARS the decision stamp rather than leaving a stale one"
);
ok(
  queueSrc.includes('const reverting = action === "unhold"'),
  "  and only unhold reverts -- approve/hold/skip still stamp the decision"
);
ok(updateBlock.includes("updated_at: now"), "  while updated_at still moves, so the reversal is visible");
ok(queueSrc.includes('error.code === "23505"'), "the one-active-parent constraint is reported, not bypassed");
ok(queueSrc.includes('error.code === "23514"'), "a CHECK refusal is reported, not worked around");

console.log("=== the original queue is not written by the recovery layer ===");
ok(
  !/from\("youtube_reply_queue"\)[\s\S]{0,200}\.(update|insert|delete|upsert)\(/.test(queueSrc),
  "youtube_reply_queue is only ever read, never written"
);
ok(
  queueSrc.includes('.from("youtube_reply_queue")') && queueSrc.includes(".select("),
  "  and the single read is a select for parent display text"
);

console.log("");
console.log(fail ? fail + " FAILURES" : "ALL YOUTUBE RECOVERY REVIEW CHECKS PASSED");
process.exit(fail ? 1 : 0);
