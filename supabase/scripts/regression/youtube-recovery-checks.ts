/**
 * Pure recovery-workflow checks. No network, database, credentials or YouTube.
 *
 * Run with:
 *   npx tsx --conditions react-server supabase/scripts/regression/youtube-recovery-checks.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canApproveRecovery,
  matchRecoveryRows,
  parseFreshRecoverySheet,
  parseLegacyPostedReplies,
  parseLegacyRecoveryEvidence,
  RecoveryImportError,
  recoveryApproveRefusal,
} from "../../../lib/youtube/recovery";

let failures = 0;
const ok = (condition: boolean, message: string) => {
  console.log((condition ? "  PASS  " : "  FAIL  ") + message);
  if (!condition) failures++;
};

const freshHeader = [
  "batch",
  "order",
  "author",
  "topic",
  "category",
  "fresh_reply",
  "link_included",
  "review_status",
  "notes",
];
const freshMatrix: unknown[][] = [freshHeader];
for (let order = 1; order <= 20; order++) {
  const category = order % 3 === 0 ? "KMATE_LINK" : "ANSWER_ONLY";
  freshMatrix.push([
    Math.floor((order - 1) / 5) + 1,
    order,
    order === 17 ? "@duplicate-author" : `@author-${order}`,
    order === 17 ? "Passport after selection" : `Topic ${order}`,
    category,
    category === "KMATE_LINK" ? `Draft ${order} https://kmate.vercel.app` : `Draft ${order}`,
    category === "KMATE_LINK" ? "Yes" : "No",
    "READY_FOR_MANUAL_REVIEW",
    "data only",
  ]);
}

const postedRaw: Record<string, unknown> = {};
for (let order = 1; order <= 20; order++) {
  const parent = `parent-${order}`;
  postedRaw[parent] = {
    reply_id: `legacy-reply-${order}`,
    author: order === 17 ? "@duplicate-author" : `@author-${order}`,
    reply: order === 17 ? "A passport may be needed later." : `Old draft ${order}`,
    spreadsheet_row: order,
  };
}
postedRaw["other-parent-for-same-author"] = {
  reply_id: "other-legacy-reply",
  author: "@duplicate-author",
  reply: "Choose one application track.",
};

const recoveryMatrix: unknown[][] = [["comment_id", "old_reply_id", "recovery_status", "notes"]];
for (const order of [3, 4, 7, 18]) {
  recoveryMatrix.push([`parent-${order}`, `legacy-reply-${order}`, "CONFIRMED_REMOVED", "Direct audit: not found"]);
}

console.log("=== Reviewed workbook shape and matching ===");
const freshRows = parseFreshRecoverySheet(freshMatrix);
const matched = matchRecoveryRows({
  freshRows,
  postedRows: parseLegacyPostedReplies(postedRaw),
  recoveryEvidence: parseLegacyRecoveryEvidence(recoveryMatrix),
  batchCommentIds: new Set(["parent-3"]),
  reviewedParentOverrides: { 17: "parent-17" },
});
ok(freshRows.length === 20, "exactly 20 fresh rows parsed");
ok(new Set(freshRows.map((row) => row.recovery_order)).size === 20, "orders are unique");
ok(
  [1, 2, 3, 4].every((batch) => freshRows.filter((row) => row.recovery_batch === batch).length === 5),
  "four batches contain five rows each"
);
ok(matched.length === 20, "all 20 rows matched to legacy parents");
ok(new Set(matched.map((row) => row.youtube_comment_id)).size === 20, "no parent was reused");
ok(
  matched.filter((row) => row.legacy_outcome === "CONFIRMED_REMOVED").length === 4,
  "four rows preserve CONFIRMED_REMOVED evidence"
);
ok(
  matched.filter((row) => row.legacy_outcome === "POSTED_RECORDED").length === 16,
  "sixteen rows remain evidence-honest POSTED_RECORDED"
);
ok(matched.find((row) => row.recovery_order === 17)?.youtube_comment_id === "parent-17", "reviewed ambiguity override is exact");

console.log("=== Approval safety ===");
const postedRecorded = { legacy_outcome: "POSTED_RECORDED" as const, status: "DRAFTED" as const, posted_reply_id: null };
const confirmedRemoved = { legacy_outcome: "CONFIRMED_REMOVED" as const, status: "DRAFTED" as const, posted_reply_id: null };
ok(recoveryApproveRefusal(postedRecorded) === "removal_unconfirmed", "POSTED_RECORDED cannot be approved");
ok(!canApproveRecovery(postedRecorded), "POSTED_RECORDED canApproveRecovery is false");
ok(canApproveRecovery(confirmedRemoved), "confirmed removal is eligible only for a future explicit approval");
ok(
  recoveryApproveRefusal({ ...confirmedRemoved, status: "APPROVED" }) === "not_drafted",
  "approval logic never approves an already-transitioned row"
);

console.log("=== Invalid sheets fail closed ===");
const badBatch = freshMatrix.map((row) => [...row]);
badBatch[1][0] = 4;
let badBatchRefused = false;
try {
  parseFreshRecoverySheet(badBatch);
} catch (error) {
  badBatchRefused = error instanceof RecoveryImportError && error.code === "fresh_batch_invalid";
}
ok(badBatchRefused, "wrong batch/order mapping is refused");

const badReview = freshMatrix.map((row) => [...row]);
badReview[1][7] = "APPROVED";
let approvedInputRefused = false;
try {
  parseFreshRecoverySheet(badReview);
} catch (error) {
  approvedInputRefused = error instanceof RecoveryImportError && error.code === "fresh_review_status_invalid";
}
ok(approvedInputRefused, "a workbook row cannot arrive pre-approved");

console.log("=== Migration contains the approved database guardrails ===");
const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260901074825_youtube_reply_recovery_attempts.sql"),
  "utf8"
);
ok(migration.includes("youtube_reply_recovery_attempts_approval_requires_removal"), "approval_requires_removal constraint exists");
ok(migration.includes("youtube_reply_recovery_attempts_active_parent_key"), "one-active-parent index exists");
ok(migration.includes("enable row level security"), "RLS is enabled");
ok(!migration.includes("create policy"), "no user-facing RLS policy is created");
ok(!migration.includes("alter table public.youtube_reply_queue"), "the original queue schema is not altered");
ok(!migration.includes("comments.insert"), "migration has no YouTube posting call");

if (failures) {
  console.error(`\n${failures} recovery check(s) failed.`);
  process.exit(1);
}
console.log("\nAll YouTube recovery checks passed.");
