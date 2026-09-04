/**
 * Exact-reply-id verifier checks -- classification, read-only enforcement,
 * and the boundary on what --apply-evidence may write.
 *
 * Run with:
 *   npx tsx --conditions react-server supabase/scripts/regression/youtube-recovery-verify-checks.ts
 *
 * The property under test is asymmetric on purpose. Exactly one observation --
 * HTTP 200 with an empty `items` array for an exact id -- may conclude that a
 * legacy reply is gone. Every other outcome, including every kind of failure,
 * must land somewhere that does NOT unlock approval. Getting this backwards
 * would manufacture permission to repost a reply YouTube had removed, which is
 * the precise harm this whole feature exists to prevent.
 *
 * Pure logic only: no network, no database, no credentials.
 */
import { readFileSync } from "node:fs";
import {
  EXPECTED_CHANNEL_ID,
  EXPECTED_CHANNEL_TITLE,
  ForbiddenWriteError,
  ReadOnlyViolationError,
  VERIFICATION_METHOD,
  VERIFICATION_RESULTS,
  WRITABLE_COLUMNS,
  assertReadOnlyRequest,
  assertWritablePatch,
  buildVerificationEvidence,
  classifyLookup,
  isReadOnlyYoutubeRequest,
  planRow,
  provesRemoval,
  readLatestVerification,
  summarise,
  verificationApproveRefusal,
  verifyChannel,
  type RecoveryRowForVerification,
} from "@/lib/youtube/recovery-verify";
import { canApproveRecovery, recoveryApproveRefusal } from "@/lib/youtube/recovery";
import { RECOVERY_REFUSAL_TEXT, recoveryDecisionRefusal } from "@/lib/youtube/recovery-review";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + m);
  if (!c) fail++;
};

const row = (over: Partial<RecoveryRowForVerification> = {}): RecoveryRowForVerification => ({
  recovery_order: 1,
  legacy_reply_id: "UgxAAA.A_bbb",
  legacy_outcome: "POSTED_RECORDED",
  legacy_evidence: null,
  status: "DRAFTED",
  ...over,
});

// -------------------------------------------------------------------------
console.log("=== 1. CONFIRMED_REMOVED: the one observation that proves removal ===");
// -------------------------------------------------------------------------
const removed = classifyLookup({ status: 200, body: { items: [] } });
ok(removed.result === "CONFIRMED_REMOVED", `200 + empty items -> CONFIRMED_REMOVED (${removed.result})`);
ok(provesRemoval("CONFIRMED_REMOVED"), "and only that result proves removal");
for (const other of VERIFICATION_RESULTS.filter((r) => r !== "CONFIRMED_REMOVED")) {
  ok(!provesRemoval(other), `  ${other} does NOT prove removal`);
}

// -------------------------------------------------------------------------
console.log("=== 2. STILL_LIVE ===");
// -------------------------------------------------------------------------
const live = classifyLookup({ status: 200, body: { items: [{ id: "UgxAAA.A_bbb" }] } });
ok(live.result === "STILL_LIVE", `200 + one item -> STILL_LIVE (${live.result})`);
ok(
  classifyLookup({ status: 200, body: { items: [{}, {}] } }).result === "STILL_LIVE",
  "more than one item is still live"
);

// -------------------------------------------------------------------------
console.log("=== 3. API_ERROR — never read as removal ===");
// -------------------------------------------------------------------------
for (const status of [401, 403, 429, 500, 503]) {
  const r = classifyLookup({ status, body: { error: { errors: [{ reason: "quotaExceeded" }] } } });
  ok(r.result === "API_ERROR", `HTTP ${status} -> API_ERROR (${r.result})`);
}
const netFail = classifyLookup({ status: 0, body: null, networkError: "ECONNRESET" });
ok(netFail.result === "API_ERROR", `a transport failure -> API_ERROR (${netFail.result})`);
ok(/ECONNRESET/.test(netFail.detail), "  and the cause is carried into the detail");
ok(
  classifyLookup({ status: 403, body: { error: { errors: [{ reason: "forbidden" }] } } }).detail.includes("forbidden"),
  "Google's short reason is surfaced, not the whole body"
);

// -------------------------------------------------------------------------
console.log("=== 4. AMBIGUOUS / malformed — also never read as removal ===");
// -------------------------------------------------------------------------
ok(classifyLookup({ status: 200, body: {} }).result === "AMBIGUOUS", "200 with no items key -> AMBIGUOUS");
ok(classifyLookup({ status: 200, body: { items: null } }).result === "AMBIGUOUS", "items: null -> AMBIGUOUS");
ok(
  classifyLookup({ status: 200, body: { items: "nope" } }).result === "AMBIGUOUS",
  "items as a non-array -> AMBIGUOUS"
);
ok(classifyLookup({ status: 200, body: null }).result === "AMBIGUOUS", "200 with an unparseable body -> AMBIGUOUS");
const notFound = classifyLookup({ status: 404, body: null });
ok(
  notFound.result === "AMBIGUOUS",
  `404 -> AMBIGUOUS, NOT removed (${notFound.result}) -- comments.list answers an unknown id with 200/empty`
);

console.log("=== the decisive property: nothing but 200+empty can conclude removal ===");
const nonRemovalCases = [
  { status: 404, body: null },
  { status: 403, body: {} },
  { status: 500, body: {} },
  { status: 200, body: {} },
  { status: 200, body: { items: null } },
  { status: 200, body: null },
  { status: 0, body: null, networkError: "timeout" },
  { status: 200, body: { items: [{}] } },
];
const leaked = nonRemovalCases.filter((c) => classifyLookup(c).result === "CONFIRMED_REMOVED");
ok(leaked.length === 0, `no failure or non-empty shape yields removal (${leaked.length} leaked)`);

// -------------------------------------------------------------------------
console.log("=== 5. wrong authenticated channel aborts ===");
// -------------------------------------------------------------------------
const right = verifyChannel({ id: EXPECTED_CHANNEL_ID, title: EXPECTED_CHANNEL_TITLE });
ok(right.ok, "the expected channel is accepted");
ok(right.ok && right.titleMatches, "  and the title matches");
const wrong = verifyChannel({ id: "UCsomeoneElse00000000000", title: "Someone Else" });
ok(!wrong.ok && wrong.reason === "channel_mismatch", `a different channel id is refused (${!wrong.ok ? wrong.reason : "ACCEPTED"})`);
const none = verifyChannel({ id: null, title: null });
ok(!none.ok && none.reason === "no_channel", "no channel at all is refused");
const renamed = verifyChannel({ id: EXPECTED_CHANNEL_ID, title: "Sushan GKS" });
ok(
  renamed.ok && !renamed.titleMatches,
  "a renamed channel with the right id is accepted but flagged -- the id is the identity"
);

// -------------------------------------------------------------------------
console.log("=== 6. dry run causes zero database writes ===");
// -------------------------------------------------------------------------
const scriptSrc = readFileSync("supabase/scripts/verify-youtube-recovery.ts", "utf8");
ok(/applyEvidence: false/.test(scriptSrc), "applyEvidence defaults to false — dry run is the default mode");
const applyIndex = scriptSrc.indexOf("if (!args.applyEvidence)");
const updateIndex = scriptSrc.indexOf(".update(patch)");
ok(applyIndex > 0 && updateIndex > applyIndex, "the only .update() sits AFTER the dry-run early return");
ok(
  /return;\s*\n\s*}\s*\n\s*console\.log\("=== applying evidence/.test(scriptSrc),
  "the dry-run branch returns before the write section is reached"
);
const updateCalls = (scriptSrc.match(/\.update\(/g) ?? []).length;
const writeCalls = (scriptSrc.match(/\.insert\(|\.upsert\(|\.delete\(/g) ?? []).length;
ok(updateCalls === 1, `exactly one .update() in the whole script (${updateCalls})`);
ok(writeCalls === 0, `no insert / upsert / delete anywhere (${writeCalls})`);

// -------------------------------------------------------------------------
console.log("=== 7. --apply-evidence may touch only permitted legacy fields ===");
// -------------------------------------------------------------------------
ok(
  WRITABLE_COLUMNS.join(",") === "legacy_outcome,legacy_evidence,updated_at",
  `the writable set is exactly the three legacy/bookkeeping columns (${WRITABLE_COLUMNS.join(", ")})`
);
const threw: string[] = [];
for (const forbidden of [
  "status",
  "posted_reply_id",
  "api_accepted_at",
  "verified_at",
  "attempt_count",
  "last_attempt_at",
  "decided_at",
  "decided_by",
  "draft_text",
  "removed_detected_at",
  "last_verified_at",
]) {
  try {
    assertWritablePatch({ legacy_outcome: "CONFIRMED_REMOVED", [forbidden]: "x" });
    threw.push(forbidden);
  } catch (e) {
    if (!(e instanceof ForbiddenWriteError)) threw.push(`${forbidden}(wrong error)`);
  }
}
ok(threw.length === 0, `every forbidden column is refused (${threw.join(", ") || "none accepted"})`);
try {
  assertWritablePatch({ legacy_outcome: "CONFIRMED_REMOVED", legacy_evidence: {}, updated_at: "t" });
  ok(true, "the permitted patch is accepted");
} catch {
  ok(false, "the permitted patch was wrongly refused");
}

console.log("=== evidence preserves import provenance ===");
const priorEvidence = {
  posted_replies: { filename: "posted_replies.json", sha256: "abc" },
  batch02: { filename: "batch02.xlsx", comment_id_found: true },
  recovery_queue: { recovery_status: "CONFIRMED_REMOVED", notes: "Direct audit: not found" },
  matching: { author: "@x", method: "unique_legacy_author" },
  fresh_workbook: { sha256: "def" },
};
const merged = buildVerificationEvidence(priorEvidence, {
  result: "CONFIRMED_REMOVED",
  checkedAt: "2026-09-01T08:38:31.269429Z",
  channelId: EXPECTED_CHANNEL_ID,
});
for (const key of Object.keys(priorEvidence)) {
  ok(
    JSON.stringify(merged[key]) === JSON.stringify(priorEvidence[key as keyof typeof priorEvidence]),
    `  ${key} survives untouched`
  );
}
ok(merged.verification_method === VERIFICATION_METHOD, "verification_method is recorded");
ok(merged.checked_at === "2026-09-01T08:38:31.269429Z", "checked_at is recorded");
ok(merged.result === "CONFIRMED_REMOVED", "result is recorded");
ok(merged.authenticated_channel_id === EXPECTED_CHANNEL_ID, "authenticated channel id is recorded");
ok(Object.keys(buildVerificationEvidence(null, { result: "API_ERROR", checkedAt: "t", channelId: "c" })).length === 4,
  "a row with no prior evidence gets exactly the four verification keys");

// -------------------------------------------------------------------------
console.log("=== 8. recovery status is never changed, and outcomes only go up ===");
// -------------------------------------------------------------------------
ok(
  !(WRITABLE_COLUMNS as readonly string[]).includes("status"),
  "status is absent from the writable set, so no plan can move it"
);
const upgrade = planRow(row({ legacy_outcome: "POSTED_RECORDED" }), classifyLookup({ status: 200, body: { items: [] } }));
ok(upgrade.upgrades && upgrade.nextOutcome === "CONFIRMED_REMOVED", "a verified-removed POSTED_RECORDED row upgrades");

for (const [result, body] of [
  ["STILL_LIVE", { items: [{}] }],
  ["API_ERROR", null],
  ["AMBIGUOUS", {}],
] as const) {
  const status = result === "API_ERROR" ? 500 : 200;
  const plan = planRow(row({ legacy_outcome: "POSTED_RECORDED" }), classifyLookup({ status, body }));
  ok(
    !plan.upgrades && plan.nextOutcome === "POSTED_RECORDED",
    `  a ${result} row stays POSTED_RECORDED and remains non-approvable`
  );
}

console.log("=== an already-confirmed row is never downgraded by a bad check ===");
for (const [label, status, body] of [
  ["API_ERROR", 500, null],
  ["AMBIGUOUS", 404, null],
  ["STILL_LIVE", 200, { items: [{}] }],
] as const) {
  const plan = planRow(row({ legacy_outcome: "CONFIRMED_REMOVED" }), classifyLookup({ status, body }));
  ok(
    plan.nextOutcome === "CONFIRMED_REMOVED" && !plan.upgrades,
    `  a stored CONFIRMED_REMOVED row survives a ${label} re-check without being demoted`
  );
}
const contradiction = summarise([
  planRow(row({ legacy_outcome: "CONFIRMED_REMOVED" }), classifyLookup({ status: 200, body: { items: [{}] } })),
]);
ok(contradiction.contradictions === 1, "a stored-removed-but-now-live row is counted as a contradiction");
ok(contradiction.wouldUpgrade === 0, "  and is never auto-resolved by the script");

console.log("=== summary arithmetic ===");
const plans = [
  planRow(row({ recovery_order: 1 }), classifyLookup({ status: 200, body: { items: [] } })),
  planRow(row({ recovery_order: 2 }), classifyLookup({ status: 200, body: { items: [{}] } })),
  planRow(row({ recovery_order: 3 }), classifyLookup({ status: 500, body: null })),
  planRow(row({ recovery_order: 4 }), classifyLookup({ status: 404, body: null })),
];
const s = summarise(plans);
ok(s.checked === 4, `checked 4 (${s.checked})`);
ok(s.confirmedRemoved === 1 && s.stillLive === 1 && s.apiError === 1 && s.ambiguous === 1, "one of each result");
ok(s.wouldUpgrade === 1, "only the confirmed-removed row would upgrade");

// -------------------------------------------------------------------------
console.log("=== 9. no YouTube write endpoint is reachable ===");
// -------------------------------------------------------------------------
const pureSrc = readFileSync("lib/youtube/recovery-verify.ts", "utf8");

/**
 * Strips comments so the scan tests CODE, not prose.
 *
 * Both files deliberately document what they refuse to do, and those doc
 * comments name comments.insert by name. A check that forbade mentioning the
 * term would punish the documentation rather than the behaviour. Block
 * comments and whole-line // or * comments are removed; inline URLs such as
 * https://... survive because only full-line comments are dropped.
 */
const NEWLINE = String.fromCharCode(10);
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(NEWLINE)
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*");
    })
    .join(NEWLINE);

for (const [name, src] of [
  ["verifier script", stripComments(scriptSrc)],
  ["verify rules", stripComments(pureSrc)],
] as const) {
  ok(!/comments\.insert/.test(src), `${name}: no comments.insert`);
  ok(!/insertReply/.test(src), `${name}: no insertReply`);
  ok(!/post-runner/.test(src), `${name}: does not reach the posting runner`);
  ok(!/from "@\/lib\/youtube\/api"|lib\/youtube\/api/.test(src), `${name}: does not import the posting API module`);
  ok(!/youtube_reply_events/.test(src), `${name}: never writes the events table`);
  ok(!/youtube_reply_queue/.test(src), `${name}: never touches the original queue`);
}

console.log("=== the request allow-list ===");
ok(isReadOnlyYoutubeRequest("https://oauth2.googleapis.com/token", "POST"), "token refresh (POST) allowed");
ok(isReadOnlyYoutubeRequest("https://www.googleapis.com/youtube/v3/channels?mine=true", "GET"), "channels.list GET allowed");
ok(isReadOnlyYoutubeRequest("https://www.googleapis.com/youtube/v3/comments?id=x", "GET"), "comments.list GET allowed");
ok(!isReadOnlyYoutubeRequest("https://www.googleapis.com/youtube/v3/comments?part=snippet", "POST"), "comments POST refused — that is comments.insert");
ok(!isReadOnlyYoutubeRequest("https://www.googleapis.com/youtube/v3/comments?id=x", "PUT"), "comments PUT refused — that is comments.update");
ok(!isReadOnlyYoutubeRequest("https://www.googleapis.com/youtube/v3/comments?id=x", "DELETE"), "comments DELETE refused");
ok(!isReadOnlyYoutubeRequest("https://www.googleapis.com/youtube/v3/commentThreads", "POST"), "commentThreads.insert refused");
ok(!isReadOnlyYoutubeRequest("https://www.googleapis.com/youtube/v3/videos", "GET"), "an endpoint outside the allow-list is refused even for GET");
ok(!isReadOnlyYoutubeRequest("https://evil.example.com/youtube/v3/comments", "GET"), "a lookalike host is refused");

let violation = false;
try {
  assertReadOnlyRequest("https://www.googleapis.com/youtube/v3/comments", "POST");
} catch (e) {
  violation = e instanceof ReadOnlyViolationError;
}
ok(violation, "assertReadOnlyRequest throws ReadOnlyViolationError on a write attempt");
ok(
  /assertReadOnlyRequest\(url, method\)/.test(scriptSrc) && /async function readOnlyFetch/.test(scriptSrc),
  "every request in the script goes through the guarded fetch helper"
);
const rawFetches = (scriptSrc.match(/(?<!return )\bfetch\(/g) ?? []).length;
ok(rawFetches === 0, `no un-guarded fetch( call outside readOnlyFetch (${rawFetches})`);


console.log("=== 10. the latest verification participates in approval ===");

/** Evidence as the importer leaves it: real provenance, never verified. */
const importEvidence = () => ({
  posted_replies: { spreadsheet_row: 4 },
  matching: { method: "exact_comment_id" },
  recovery_queue: { notes: "batch 02" },
});

const verified = (result: unknown, extra: Record<string, unknown> = {}) => ({
  ...importEvidence(),
  verification_method: VERIFICATION_METHOD,
  checked_at: "2026-09-04T00:00:00.000Z",
  result,
  authenticated_channel_id: EXPECTED_CHANNEL_ID,
  ...extra,
});

/** A row approvable in every pre-existing respect, which each case then varies. */
const gateRow = (evidence: Record<string, unknown> | null, outcome = "CONFIRMED_REMOVED") =>
  ({
    status: "DRAFTED",
    legacy_outcome: outcome,
    posted_reply_id: null,
    legacy_evidence: evidence,
  }) as Parameters<typeof recoveryApproveRefusal>[0];

// Case 1 -- confirmed removed, and the latest check agrees.
ok(
  recoveryApproveRefusal(gateRow(verified("CONFIRMED_REMOVED"))) === null,
  "case 1: CONFIRMED_REMOVED + latest CONFIRMED_REMOVED may proceed"
);
ok(canApproveRecovery(gateRow(verified("CONFIRMED_REMOVED"))), "case 1: canApproveRecovery agrees");
ok(
  recoveryDecisionRefusal("approve", gateRow(verified("CONFIRMED_REMOVED"))) === null,
  "case 1: the review layer agrees"
);

// Case 2 -- the contradiction. This is the gap this section exists to close.
ok(
  recoveryApproveRefusal(gateRow(verified("STILL_LIVE"))) === "verification_still_live",
  "case 2: CONFIRMED_REMOVED + latest STILL_LIVE is REFUSED"
);
ok(!canApproveRecovery(gateRow(verified("STILL_LIVE"))), "case 2: canApproveRecovery is false");
ok(
  recoveryDecisionRefusal("approve", gateRow(verified("STILL_LIVE"))) === "verification_still_live",
  "case 2: the review layer refuses too -- the UI cannot bypass the gate"
);

// Case 3 -- a failed check is not permission.
ok(
  recoveryApproveRefusal(gateRow(verified("API_ERROR"))) === "verification_inconclusive",
  "case 3: CONFIRMED_REMOVED + latest API_ERROR is REFUSED"
);
ok(!canApproveRecovery(gateRow(verified("API_ERROR"))), "case 3: canApproveRecovery is false");
ok(
  recoveryDecisionRefusal("approve", gateRow(verified("API_ERROR"))) === "verification_inconclusive",
  "case 3: the review layer refuses too"
);

// Case 4 -- neither is a check we could not interpret.
ok(
  recoveryApproveRefusal(gateRow(verified("AMBIGUOUS"))) === "verification_inconclusive",
  "case 4: CONFIRMED_REMOVED + latest AMBIGUOUS is REFUSED"
);
ok(!canApproveRecovery(gateRow(verified("AMBIGUOUS"))), "case 4: canApproveRecovery is false");
ok(
  recoveryDecisionRefusal("approve", gateRow(verified("AMBIGUOUS"))) === "verification_inconclusive",
  "case 4: the review layer refuses too"
);

// Case 5 -- a positive live check does NOT bypass the recorded legacy outcome.
// The existing removal rule still answers first: a reading nobody has committed
// to the row with --apply-evidence is not yet the row's outcome.
ok(
  recoveryApproveRefusal(gateRow(verified("CONFIRMED_REMOVED"), "POSTED_RECORDED")) ===
    "removal_unconfirmed",
  "case 5: POSTED_RECORDED + latest CONFIRMED_REMOVED still refuses on the existing removal rule"
);
ok(
  recoveryApproveRefusal(gateRow(verified("CONFIRMED_REMOVED"))) === null,
  "case 5 control: the same evidence on a CONFIRMED_REMOVED row IS approvable, so it is the outcome that refused"
);

// Case 6 -- never verified: the pre-existing behaviour, unweakened.
ok(
  recoveryApproveRefusal(gateRow(null)) === null,
  "case 6: no verification evidence keeps the existing legacy_outcome behaviour"
);
ok(
  recoveryApproveRefusal(gateRow(importEvidence())) === null,
  "case 6: import-only evidence is not mistaken for a verification"
);
ok(
  recoveryApproveRefusal(gateRow(importEvidence(), "POSTED_RECORDED")) === "removal_unconfirmed",
  "case 6: POSTED_RECORDED without verification still refuses exactly as before"
);

console.log("=== the full outcome x result matrix ===");
// The whole policy in one table: approvable only where the recorded outcome
// AND the latest check both say removed.
for (const outcome of ["POSTED_RECORDED", "CONFIRMED_REMOVED"]) {
  for (const result of VERIFICATION_RESULTS) {
    const refusal = recoveryApproveRefusal(gateRow(verified(result), outcome));
    const approvable = refusal === null;
    const expected = outcome === "CONFIRMED_REMOVED" && result === "CONFIRMED_REMOVED";
    ok(
      approvable === expected,
      outcome + " + latest " + result + " -> " + (approvable ? "approvable" : "refused (" + refusal + ")")
    );
  }
}

console.log("=== the gate can only ever subtract ===");
for (const outcome of ["POSTED_RECORDED", "CONFIRMED_REMOVED"]) {
  const withoutEvidence = recoveryApproveRefusal(gateRow(null, outcome)) === null;
  for (const result of VERIFICATION_RESULTS) {
    const withEvidence = recoveryApproveRefusal(gateRow(verified(result), outcome)) === null;
    ok(
      !withEvidence || withoutEvidence,
      "adding " + result + " evidence never makes an unapprovable " + outcome + " row approvable"
    );
  }
}

console.log("=== unreadable verification evidence fails closed ===");
ok(
  recoveryApproveRefusal(
    gateRow({ ...importEvidence(), verification_method: "eyeballed_it", result: "CONFIRMED_REMOVED" })
  ) === "verification_unreadable",
  "a result recorded by an unknown method is not trusted"
);
ok(
  recoveryApproveRefusal(gateRow({ ...importEvidence(), verification_method: VERIFICATION_METHOD })) ===
    "verification_unreadable",
  "a verification carrying no result at all is refused"
);
ok(
  recoveryApproveRefusal(gateRow(verified("PROBABLY_GONE"))) === "verification_unreadable",
  "a result outside VERIFICATION_RESULTS is refused"
);
ok(
  recoveryApproveRefusal(gateRow(verified(42))) === "verification_unreadable",
  "a non-string result is refused"
);
ok(
  recoveryApproveRefusal(gateRow({ ...importEvidence(), result: "CONFIRMED_REMOVED" })) ===
    "verification_unreadable",
  "a result with no method beside it is refused"
);

console.log("=== reading the latest verification ===");
ok(readLatestVerification(null) === null, "no evidence reads as never checked");
ok(readLatestVerification(importEvidence()) === null, "import evidence reads as never checked");
const latest = readLatestVerification(verified("STILL_LIVE"));
ok(latest?.result === "STILL_LIVE", "the stored result is read back");
ok(latest?.method === VERIFICATION_METHOD, "the method identifies HOW the row was checked");
ok(latest?.checkedAt === "2026-09-04T00:00:00.000Z", "checked_at identifies WHEN the latest check ran");
ok(latest?.channelId === EXPECTED_CHANNEL_ID, "the authenticated channel is read back");
ok(
  verificationApproveRefusal(verified("CONFIRMED_REMOVED")) === null &&
    verificationApproveRefusal(verified("STILL_LIVE")) === "verification_still_live" &&
    verificationApproveRefusal(verified("API_ERROR")) === "verification_inconclusive" &&
    verificationApproveRefusal(verified("AMBIGUOUS")) === "verification_inconclusive" &&
    verificationApproveRefusal(null) === null,
  "verificationApproveRefusal maps every result exactly once"
);

console.log("=== provenance survives, legacy_outcome is never rewritten ===");
const contradicted = row({ legacy_outcome: "CONFIRMED_REMOVED" });
const contradictedPlan = planRow(contradicted, classifyLookup({ status: 200, body: { items: [{ id: "x" }] } }));
ok(contradictedPlan.result === "STILL_LIVE", "a contradiction is classified STILL_LIVE");
ok(
  contradictedPlan.nextOutcome === "CONFIRMED_REMOVED" && !contradictedPlan.upgrades,
  "the historical legacy_outcome is preserved, not downgraded"
);
const contradictedEvidence = buildVerificationEvidence(importEvidence(), {
  result: contradictedPlan.result,
  checkedAt: "2026-09-04T00:00:00.000Z",
  channelId: EXPECTED_CHANNEL_ID,
});
ok(
  contradictedEvidence.posted_replies !== undefined &&
    contradictedEvidence.matching !== undefined &&
    contradictedEvidence.recovery_queue !== undefined,
  "import provenance survives a contradicting verification"
);
ok(
  recoveryApproveRefusal(gateRow(contradictedEvidence)) === "verification_still_live",
  "and the row that keeps its historical outcome is nonetheless UNAPPROVABLE"
);

console.log("=== every refusal reason has reviewer-facing wording ===");
for (const reason of ["verification_still_live", "verification_inconclusive", "verification_unreadable"]) {
  ok(typeof RECOVERY_REFUSAL_TEXT[reason] === "string", reason + " has UI text");
}

console.log("=== the gate is central: no caller can reach approval around it ===");
const recoverySrc = readFileSync("lib/youtube/recovery.ts", "utf8");
const reviewSrc = readFileSync("lib/youtube/recovery-review.ts", "utf8");
const queueSrc = readFileSync("lib/youtube/recovery-queue.ts", "utf8");
const uiSrc = readFileSync("components/admin/youtube-recovery.tsx", "utf8");
const requiredEvidence = /legacy_evidence: Record<string, unknown> \| null;/;
ok(
  /verificationApproveRefusal\(row\.legacy_evidence\)/.test(recoverySrc),
  "recoveryApproveRefusal consults the latest verification"
);
ok(requiredEvidence.test(recoverySrc), "legacy_evidence is REQUIRED, so no caller can omit it and skip the gate");
ok(requiredEvidence.test(reviewSrc), "the review layer requires it too");
ok(
  /return recoveryApproveRefusal\(row\)/.test(reviewSrc),
  "the review layer delegates approval rather than re-implementing it"
);
ok(
  !/legacy_outcome\s*===\s*"CONFIRMED_REMOVED"/.test(queueSrc),
  "the queue never decides approvability from legacy_outcome on its own"
);
ok(
  /const approveBlock = recoveryDecisionRefusal\("approve", item\)/.test(uiSrc) &&
    /approveBlock === null && \(/.test(uiSrc),
  "the UI enables its approve control from the shared gate, never from legacy_outcome"
);
ok(
  /readLatestVerification\(item\.legacy_evidence\)/.test(uiSrc) &&
    /latestCheck === null \|\| latestCheck\.result === "CONFIRMED_REMOVED"/.test(uiSrc),
  "the UI shows removal as proven only while the latest check still agrees"
);
ok(/legacy_evidence/.test(queueSrc), "the queue selects legacy_evidence, so the gate actually sees it");
ok(
  /recoveryDecisionRefusal\(action, row\)/.test(queueSrc),
  "the write path checks the gate before it updates status"
);

console.log("");
console.log(fail ? fail + " FAILURES" : "ALL YOUTUBE RECOVERY VERIFY CHECKS PASSED");
process.exit(fail ? 1 : 0);
