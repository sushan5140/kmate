/**
 * YouTube outreach -- state machine and import checks.
 *
 * Run with:  npx tsx --conditions react-server supabase/scripts/regression/youtube-outreach-checks.ts
 *
 * The properties under test are the ones the previous local bot got wrong.
 * It posted 120 replies in bulk, checked each one five seconds later, and
 * reported them all live; a later audit against the exact reply ids found
 * most of them gone. So:
 *
 *   - API_ACCEPTED must never read as success
 *   - a check that is too early must be refused, not answered
 *   - REMOVED must be terminal, with no path back to a postable state
 *   - FAILED must never return to APPROVED on its own
 *   - nothing a browser can send may produce POSTING
 *
 * Pure logic only: no network, no database, no credentials.
 */
import { existsSync, readFileSync } from "node:fs";
import readXlsxFile from "read-excel-file/node";
import { assertExpectedChannel, YoutubeApiError } from "@/lib/youtube/api";
import { isYoutubeConfigured } from "@/lib/youtube/oauth";
import {
  DECISION_ACTIONS,
  DEFAULT_DAILY_POST_LIMIT,
  DEFAULT_MIN_VERIFY_AGE_HOURS,
  STATUS_LABELS,
  YOUTUBE_STATUSES,
  approveRefusal,
  canApprove,
  canEditDraft,
  canHoldOrSkip,
  canMarkFailed,
  canPost,
  canVerify,
  isDecisionAction,
  isYoutubeStatus,
  MAX_IMPORT_ROWS,
  MAX_UPLOAD_BYTES,
  readPositiveIntEnv,
  resolveDraft,
  statusTone,
  verifyRefusal,
  type QueueRowFacts,
} from "@/lib/youtube/queue-schema";
import {
  detectHeaderRow,
  initialStatusFor,
  legacyStatusFor,
  mapHeaderColumns,
  parseLegacyPostedReplies,
  parseSheet,
  SheetFormatError,
  type SheetMatrix,
} from "@/lib/youtube/import";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + m);
  if (!c) fail++;
};

/** A row that is postable in every respect, which each test then breaks. */
const postable = (over: Partial<QueueRowFacts> = {}): QueueRowFacts => ({
  status: "APPROVED",
  source_type: "comment",
  automation_action: "POST",
  final_draft: "Here is the answer.",
  edited_draft: null,
  posted_reply_id: null,
  is_legacy: false,
  api_accepted_at: null,
  manual_follow_up: false,
  ...over,
});

// -------------------------------------------------------------------------
console.log("=== REMOVED is terminal: nothing reposts a reply YouTube took down ===");
// -------------------------------------------------------------------------
const removed = postable({ status: "REMOVED", posted_reply_id: "Ugx.reply1" });
ok(approveRefusal(removed) === "terminal", `approve refused as terminal (${approveRefusal(removed)})`);
ok(!canApprove(removed), "canApprove false");
ok(!canPost(removed), "canPost false");
ok(!canHoldOrSkip(removed), "hold/skip refused too -- no way to launder it back");
ok(!canMarkFailed(removed), "mark_failed refused");
ok(
  verifyRefusal(removed, new Date(), 24) === "terminal",
  "even re-verification is refused once removed"
);
// The decisive one: no verb in the whole decision map can reach APPROVED.
const reachableFromRemoved = Object.keys(DECISION_ACTIONS).filter((action) => {
  if (action === "approve") return canApprove(removed);
  if (action === "mark_failed") return canMarkFailed(removed);
  return canHoldOrSkip(removed);
});
ok(reachableFromRemoved.length === 0, `no decision verb applies to a REMOVED row (${reachableFromRemoved.join(",") || "none"})`);

// -------------------------------------------------------------------------
console.log("=== FAILED needs an explicit re-approval, and never retries itself ===");
// -------------------------------------------------------------------------
const failed = postable({ status: "FAILED" });
ok(canApprove(failed), "an admin MAY approve a failed row");
ok(!canPost(failed), "but FAILED is not postable on its own -- no automatic retry");
ok(canPost(postable({ status: "APPROVED" })), "only APPROVED is postable");
ok(
  !canPost(postable({ status: "DRAFTED" })) &&
    !canPost(postable({ status: "HOLD" })) &&
    !canPost(postable({ status: "SKIP" })) &&
    !canPost(postable({ status: "SCRAPED" })) &&
    !canPost(postable({ status: "POSTING" })),
  "no other status is postable"
);

// -------------------------------------------------------------------------
console.log("=== POSTING is server-side only ===");
// -------------------------------------------------------------------------
const producible = Object.values(DECISION_ACTIONS) as string[];
ok(!producible.includes("POSTING"), `no decision verb produces POSTING (${producible.join(", ")})`);
ok(!producible.includes("API_ACCEPTED"), "nor API_ACCEPTED");
ok(!producible.includes("VERIFIED_LIVE"), "nor VERIFIED_LIVE");
ok(!producible.includes("REMOVED"), "nor REMOVED");
ok(!isDecisionAction("POSTING"), "'POSTING' is not an accepted action name");
ok(!isDecisionAction("__proto__"), "prototype keys are not accepted actions");
ok(isDecisionAction("approve") && isDecisionAction("hold") && isDecisionAction("skip"), "the real verbs are");
const inFlight = postable({ status: "POSTING" });
ok(approveRefusal(inFlight) === "in_flight", "an in-flight row cannot be approved out from under the attempt");
ok(canMarkFailed(inFlight), "only mark_failed applies to it, and only from POSTING");
ok(!canMarkFailed(postable({ status: "APPROVED" })), "mark_failed refused from anywhere else");

// -------------------------------------------------------------------------
console.log("=== approving is refused for anything that could never post ===");
// -------------------------------------------------------------------------
ok(approveRefusal(postable({ source_type: "reply" })) === "not_top_level", "a nested reply");
ok(approveRefusal(postable({ automation_action: "HOLD" })) === "action_not_post", "a HOLD row");
ok(approveRefusal(postable({ automation_action: "SKIP" })) === "action_not_post", "a SKIP row");
ok(approveRefusal(postable({ final_draft: "   " })) === "no_draft", "a blank draft");
ok(approveRefusal(postable({ final_draft: null })) === "no_draft", "a missing draft");
ok(approveRefusal(postable({ is_legacy: true })) === "legacy", "a legacy row the old bot already answered");
ok(
  approveRefusal(postable({ posted_reply_id: "Ugx.r" })) === "already_posted",
  "a row that already carries a reply id"
);
ok(approveRefusal(postable({ status: "API_ACCEPTED" })) === "already_posted", "an accepted row");
ok(approveRefusal(postable({ status: "VERIFIED_LIVE" })) === "already_posted", "a live row");
ok(approveRefusal(postable()) === null, "and a genuinely postable row is approvable");

console.log("=== legacy rows are unpostable regardless of status ===");
for (const status of YOUTUBE_STATUSES) {
  const row = postable({ status, is_legacy: true });
  if (canPost(row)) ok(false, `legacy row postable in ${status}`);
}
ok(true, "no status makes a legacy row postable");

// -------------------------------------------------------------------------
console.log("=== verification: the five-second check is refused ===");
// -------------------------------------------------------------------------
const postedAt = new Date("2026-08-30T10:00:00Z");
const accepted = postable({
  status: "API_ACCEPTED",
  posted_reply_id: "Ugx.reply1",
  api_accepted_at: postedAt.toISOString(),
});

const fiveSecondsLater = new Date(postedAt.getTime() + 5_000);
ok(
  verifyRefusal(accepted, fiveSecondsLater, 24) === "too_early",
  "5 seconds after posting -> too_early (this is exactly what the old bot did)"
);
ok(!canVerify(accepted, fiveSecondsLater, 24), "  and canVerify is false");
ok(
  verifyRefusal(accepted, new Date(postedAt.getTime() + 23.5 * 3600_000), 24) === "too_early",
  "23.5h -> still too early"
);
ok(
  verifyRefusal(accepted, new Date(postedAt.getTime() + 24.5 * 3600_000), 24) === null,
  "24.5h -> allowed"
);
ok(
  verifyRefusal(accepted, new Date(postedAt.getTime() + 2 * 3600_000), 1) === null,
  "a shorter configured window is honoured"
);
ok(
  verifyRefusal(postable({ status: "API_ACCEPTED", posted_reply_id: null }), fiveSecondsLater, 24) ===
    "no_reply_id",
  "nothing to check without a stored reply id"
);
ok(
  verifyRefusal(postable({ status: "APPROVED", posted_reply_id: "Ugx.r" }), fiveSecondsLater, 24) ===
    "wrong_status",
  "an unposted row is not verifiable"
);

console.log("=== a live reply stays checkable, and may still turn out to be gone ===");
const live = postable({
  status: "VERIFIED_LIVE",
  posted_reply_id: "Ugx.reply1",
  api_accepted_at: postedAt.toISOString(),
});
ok(
  verifyRefusal(live, new Date(postedAt.getTime() + 96 * 3600_000), 24) === null,
  "VERIFIED_LIVE is re-verifiable -- being live once is not permanent"
);

console.log("=== legacy rows bypass the age gate, because the bot posted them long ago ===");
const legacyAccepted = postable({
  status: "API_ACCEPTED",
  posted_reply_id: "Ugx.old",
  is_legacy: true,
  api_accepted_at: null,
});
ok(
  verifyRefusal(legacyAccepted, new Date(), 24) === null,
  "a legacy row with no api_accepted_at is still verifiable"
);
ok(
  verifyRefusal(postable({ status: "API_ACCEPTED", posted_reply_id: "Ugx.x" }), new Date(), 24) ===
    "too_early",
  "but a NON-legacy row with no timestamp is refused, never assumed old"
);

// -------------------------------------------------------------------------
console.log("=== API_ACCEPTED never presents as success ===");
// -------------------------------------------------------------------------
ok(statusTone("API_ACCEPTED") === "pending", `API_ACCEPTED tone is pending (${statusTone("API_ACCEPTED")})`);
ok(statusTone("VERIFIED_LIVE") === "success", "only VERIFIED_LIVE is success");
ok(statusTone("REMOVED") === "danger" && statusTone("FAILED") === "danger", "REMOVED and FAILED are danger");
ok(statusTone("POSTING") === "pending", "POSTING is pending");
const successStatuses = YOUTUBE_STATUSES.filter((s) => statusTone(s) === "success");
ok(
  successStatuses.length === 1 && successStatuses[0] === "VERIFIED_LIVE",
  `exactly one status reads as success: ${successStatuses.join(", ")}`
);
ok(
  /unconfirmed/i.test(STATUS_LABELS.API_ACCEPTED),
  `its label says so in words: "${STATUS_LABELS.API_ACCEPTED}"`
);
ok(YOUTUBE_STATUSES.every((s) => isYoutubeStatus(s)), "every declared status validates");
ok(!isYoutubeStatus("LIVE") && !isYoutubeStatus(""), "invented statuses do not");

// -------------------------------------------------------------------------
console.log("=== drafts and limits ===");
// -------------------------------------------------------------------------
ok(resolveDraft({ final_draft: "original", edited_draft: "edited" }) === "edited", "an edit wins");
ok(resolveDraft({ final_draft: "original", edited_draft: "   " }) === "original", "a blank edit does not");
ok(resolveDraft({ final_draft: null, edited_draft: null }) === "", "nothing at all yields empty");
ok(canEditDraft(postable({ status: "APPROVED" })), "an approved row is still editable");
ok(!canEditDraft(postable({ status: "POSTING" })), "a claimed row is not");
ok(!canEditDraft(postable({ status: "API_ACCEPTED" })), "nor a posted one");

ok(readPositiveIntEnv(undefined, 5) === 5, "unset limit -> default");
ok(readPositiveIntEnv("3", 5) === 3, "a valid limit is honoured");
ok(readPositiveIntEnv("0", 5) === 5, "zero -> default, never uncapped");
ok(readPositiveIntEnv("-2", 5) === 5, "negative -> default");
ok(readPositiveIntEnv("abc", 5) === 5, "garbage -> default");
ok(readPositiveIntEnv("2.5", 5) === 5, "non-integer -> default");
ok(readPositiveIntEnv("  4  ", 5) === 4, "surrounding whitespace is tolerated");
ok(DEFAULT_DAILY_POST_LIMIT === 5, `default daily cap is 5 (${DEFAULT_DAILY_POST_LIMIT})`);
ok(DEFAULT_MIN_VERIFY_AGE_HOURS === 24, `default verify age is 24h (${DEFAULT_MIN_VERIFY_AGE_HOURS})`);
ok(MAX_IMPORT_ROWS > 0 && MAX_IMPORT_ROWS <= 5000, `an import row ceiling exists (${MAX_IMPORT_ROWS})`);
ok(MAX_UPLOAD_BYTES === 5 * 1024 * 1024, `and a byte ceiling (${MAX_UPLOAD_BYTES})`);

/** Needs await, so it runs in the async chain at the end of this file. */
async function channelGuardCheck(): Promise<void> {
  console.log("=== the channel guard fails CLOSED when unconfigured ===");
  const saved = process.env.YOUTUBE_CHANNEL_ID;
  delete process.env.YOUTUBE_CHANNEL_ID;

  ok(!isYoutubeConfigured(), "isYoutubeConfigured() is false without YOUTUBE_CHANNEL_ID");

  let code = "";
  try {
    // Throws before any network call, so this check needs no credentials.
    await assertExpectedChannel();
    code = "__did_not_throw__";
  } catch (error) {
    code = error instanceof YoutubeApiError ? error.code : "wrong_error_type";
  }
  ok(
    code === "channel_not_configured",
    `posting is refused when YOUTUBE_CHANNEL_ID is unset (${code}) -- it does not silently skip the check`
  );

  if (saved === undefined) delete process.env.YOUTUBE_CHANNEL_ID;
  else process.env.YOUTUBE_CHANNEL_ID = saved;
}

// -------------------------------------------------------------------------
console.log("=== sheet import: the header is found, not assumed ===");
// -------------------------------------------------------------------------
const HEADERS = [
  "platform", "source_type", "video_id", "video_title", "channel_title",
  "comment_id", "parent_comment_id", "username", "raw_text", "source_url",
  "topic", "score", "confidence", "reply_status", "general_reply",
  "kmate_reply", "use_kmate", "best_choice", "final_draft", "automation_action",
];

const dataRow = (over: Record<string, string | number | null>) =>
  HEADERS.map((h) => (h in over ? over[h] : "x"));

const withTitleRows = (rows: (string | number | null)[][]): SheetMatrix => [
  ["GKS YouTube Scout", null, null],
  ["108 candidates", null, null],
  [null, null, null],
  HEADERS,
  ...rows,
];

ok(detectHeaderRow(withTitleRows([])) === 3, "header found at index 3 under three title rows");
ok(detectHeaderRow([HEADERS]) === 0, "and at index 0 when there are none -- row 4 is not hardcoded");
ok(detectHeaderRow([[], [], [], [], [], HEADERS]) === 5, "and further down");
ok(detectHeaderRow([["a", "b"], ["c"]]) === -1, "absent header reports -1");

const columns = mapHeaderColumns([...HEADERS, "reply_basis", "duplicate_key", "raw_id"]);
ok(!columns.has("reply_basis") && !columns.has("duplicate_key") && !columns.has("raw_id"),
  "columns outside the allow-list are ignored");
ok(columns.get("comment_id") === HEADERS.indexOf("comment_id"), "allow-listed columns map to their index");

// -------------------------------------------------------------------------
console.log("=== sheet import: eligibility, inherited unchanged from the bot ===");
// -------------------------------------------------------------------------
const sheet = withTitleRows([
  dataRow({ source_type: "comment", automation_action: "POST", comment_id: "c1", final_draft: "yes" }),
  dataRow({ source_type: "reply", automation_action: "HOLD", comment_id: "c2", final_draft: "yes" }),
  dataRow({ source_type: "comment", automation_action: "SKIP", comment_id: "c3", final_draft: "yes" }),
  dataRow({ source_type: "comment", automation_action: "POST", comment_id: "c4", final_draft: null }),
  dataRow({ source_type: "comment", automation_action: "POST", comment_id: null, final_draft: "yes" }),
  HEADERS.map(() => null),
]);

const parsed = parseSheet(sheet);
ok(parsed.headerRowIndex === 3, "header row reported");
ok(parsed.totalRows === 5, `blank rows are not counted (${parsed.totalRows})`);
ok(parsed.candidates.length === 4, `a row with no comment_id is not a candidate (${parsed.candidates.length})`);
ok(parsed.skipped.length === 1 && parsed.skipped[0].reason === "no_comment_id", "it is recorded as skipped");

const byId = new Map(parsed.candidates.map((c) => [c.youtube_comment_id, c]));
ok(byId.get("c1")!.eligible && byId.get("c1")!.status === "DRAFTED",
  "comment + POST + draft -> eligible, and lands in DRAFTED, NOT approved");
ok(!byId.get("c2")!.eligible && byId.get("c2")!.status === "HOLD", "a nested reply keeps its HOLD verdict");
ok(!byId.get("c3")!.eligible && byId.get("c3")!.status === "SKIP", "a SKIP row keeps its verdict");
ok(!byId.get("c4")!.eligible && byId.get("c4")!.status === "SCRAPED", "POST with no draft is not eligible");
ok(parsed.candidates.every((c) => !canPost({ ...postable(), ...c, is_legacy: false })),
  "NO imported row is postable straight out of the import -- every one needs a human");
ok(byId.get("c1")!.spreadsheet_row === 5, `1-based sheet row is preserved (${byId.get("c1")!.spreadsheet_row})`);

ok(initialStatusFor(true, "POST") === "DRAFTED", "eligible -> DRAFTED");
ok(initialStatusFor(false, "HOLD") === "HOLD", "HOLD -> HOLD");
ok(initialStatusFor(false, "SKIP") === "SKIP", "SKIP -> SKIP");
ok(initialStatusFor(false, null) === "SCRAPED", "no verdict -> SCRAPED");
ok(initialStatusFor(false, "POST") === "SCRAPED", "ineligible POST never becomes DRAFTED");

let threw = "";
try {
  parseSheet([["nothing", "useful"], ["at", "all"]]);
} catch (error) {
  threw = error instanceof SheetFormatError ? error.code : "wrong_error";
}
ok(threw === "header_not_found", `a sheet with no header is refused (${threw})`);

console.log("=== sheet import: value coercion ===");
const coerced = parseSheet(withTitleRows([
  dataRow({ comment_id: "c9", use_kmate: "Yes", score: 5, confidence: "High", source_type: "COMMENT", automation_action: "post" }),
]));
const c9 = coerced.candidates[0];
ok(c9.use_kmate === true, "'Yes' -> true");
ok(c9.score === 5, "score stays numeric");
ok(c9.confidence === "High", "confidence stays the word the sheet used, not a number");
ok(c9.source_type === "comment" && c9.automation_action === "POST",
  "source_type lowercased, automation_action uppercased -- casing cannot change eligibility");
ok(c9.eligible, "so a mixed-case row is still correctly eligible");

// -------------------------------------------------------------------------
console.log("=== legacy import: attempted comments never become postable again ===");
// -------------------------------------------------------------------------
const legacy = parseLegacyPostedReplies({
  "UgxAAA": { author: "@a", reply: "hi", reply_id: "UgxAAA.r1", spreadsheet_row: 7, video_id: "v1" },
  "UgxBBB": { author: "@b", reply: "hi", reply_id: "", spreadsheet_row: 8, video_id: "v1" },
});
ok(legacy.records.length === 2, "both records parsed");
const withId = legacy.records.find((r) => r.youtube_comment_id === "UgxAAA")!;
const noId = legacy.records.find((r) => r.youtube_comment_id === "UgxBBB")!;
ok(withId.posted_reply_id === "UgxAAA.r1", "the reply id is carried over -- it is what verification queries");
ok(noId.posted_reply_id === null, "an empty reply id becomes null");
ok(legacyStatusFor(withId) === "API_ACCEPTED",
  "a recorded reply is API_ACCEPTED: accepted once, and NOT assumed live");
ok(legacyStatusFor(withId) !== "VERIFIED_LIVE",
  "  never VERIFIED_LIVE on import -- that would repeat the original false success");
ok(legacyStatusFor(noId) === "SKIP", "a record with no reply id is SKIP, not retried");
ok(
  !canPost({ ...postable(), status: legacyStatusFor(withId), is_legacy: true, posted_reply_id: withId.posted_reply_id }),
  "and neither is postable"
);

let legacyThrew = "";
try {
  parseLegacyPostedReplies([1, 2, 3]);
} catch (error) {
  legacyThrew = error instanceof SheetFormatError ? error.code : "wrong_error";
}
ok(legacyThrew === "legacy_not_object", `a JSON array is refused (${legacyThrew})`);

// -------------------------------------------------------------------------
// Optional: the real spreadsheet, when it is present on this machine.
// -------------------------------------------------------------------------
const REAL_SHEET = "C:/Users/DELL/KMate-YouTube-Reply-Bot/batch02.xlsx";

async function realSheetCheck(): Promise<void> {
  if (!existsSync(REAL_SHEET)) {
    console.log("=== real batch02.xlsx not present on this machine -- skipped ===");
    return;
  }

  try {
    console.log("=== against the real batch02.xlsx ===");
    const workbook = (await readXlsxFile(readFileSync(REAL_SHEET))) as unknown as Array<{
      sheet: string;
      data: SheetMatrix;
    }>;
    const target = workbook.find((s) => s.sheet === "YouTube Questions") ?? workbook[0];
    const real = parseSheet(target.data);
    const eligible = real.candidates.filter((c) => c.eligible).length;
    const ids = new Set(real.candidates.map((c) => c.youtube_comment_id));

    ok(real.headerRowIndex === 3, `header detected at row 4 (index ${real.headerRowIndex})`);
    ok(real.totalRows === 108, `108 data rows (${real.totalRows})`);
    ok(real.candidates.length === 108, `all 108 have a comment id (${real.candidates.length})`);
    ok(eligible === 84, `84 eligible, matching the bot's own filter (${eligible})`);
    ok(ids.size === 108, `every comment id is distinct (${ids.size}) -- safe as the dedupe key`);
    ok(
      real.candidates.filter((c) => c.status === "HOLD").length === 13,
      `13 HOLD rows imported for visibility (${real.candidates.filter((c) => c.status === "HOLD").length})`
    );
    ok(
      real.candidates.filter((c) => c.status === "SKIP").length === 11,
      `11 SKIP rows imported for visibility (${real.candidates.filter((c) => c.status === "SKIP").length})`
    );
    ok(
      real.candidates.filter((c) => c.source_type === "reply").every((c) => !c.eligible),
      "none of the 20 nested replies is eligible"
    );
    ok(
      real.candidates.every((c) => c.youtube_comment_id !== c.parent_comment_id),
      "no row's comment id equals its parent id"
    );
  } catch (error) {
    ok(false, `real-sheet check errored: ${error instanceof Error ? error.message : String(error)}`);
  }
}

void channelGuardCheck()
  .then(realSheetCheck)
  .then(() => {
    console.log("");
    console.log(fail ? fail + " FAILURES" : "ALL YOUTUBE OUTREACH CHECKS PASSED");
    process.exit(fail ? 1 : 0);
  });
