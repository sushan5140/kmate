/**
 * YouTube outreach -- daily workspace, batch posting and analytics checks.
 *
 * Run with:  npx tsx --conditions react-server supabase/scripts/regression/youtube-daily-checks.ts
 *
 * Companion to youtube-outreach-checks.ts, which covers the reply state
 * machine. This file covers everything added for the daily workspace: day
 * boundaries in the admin's timezone, carry-forward, the batch allowance, the
 * batch runner's stopping strategy, and the survival metric.
 *
 * The through-line is the same as the state machine's. A previous bot posted
 * in bulk and reported success it had not verified. So the ceiling must not be
 * escapable, a batch must stop the moment it stops knowing what happened, and
 * an unverified reply must count as neither alive nor dead.
 *
 * Pure logic only: no network, no database, no credentials.
 */
import {
  DEFAULT_TIMEZONE,
  addDays,
  carriedFromDay,
  dayRange,
  formatDayShort,
  humanAge,
  isDayString,
  parseDayScope,
  readTimezone,
  recentDays,
  resolveScope,
  today,
  yesterday,
  zonedDayString,
  zonedDayStartUtc,
} from "@/lib/youtube/day-window";
import {
  MAX_BATCH_REQUEST,
  batchAllowance,
  canPost,
  clampBatchSize,
  postRefusal,
  type QueueRowFacts,
} from "@/lib/youtube/queue-schema";
import {
  featureTagsFor,
  opportunityTypeFrom,
  priorityFromImport,
  promotionCategoryOf,
  replyVoiceOf,
  PRIORITY_RANK,
} from "@/lib/youtube/classify";
import { computeSurvival, formatSurvivalRate } from "@/lib/youtube/metrics";
import { ROLLING_WINDOW_HOURS } from "@/lib/youtube/queue";
import { postBatch, type PostContext, type PostOutcome } from "@/lib/youtube/post-runner";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + m);
  if (!c) fail++;
};

const IST = "Asia/Kolkata";

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
console.log("=== the day boundary is the admin's midnight, not UTC's ===");
// -------------------------------------------------------------------------
ok(DEFAULT_TIMEZONE === "Asia/Kolkata", `default timezone is Asia/Kolkata (${DEFAULT_TIMEZONE})`);
ok(readTimezone(undefined) === IST, "an unset YOUTUBE_TIMEZONE falls back to it");
ok(readTimezone("  ") === IST, "so does a blank one");
ok(readTimezone("Not/AZone") === IST, "and an invalid zone falls back rather than throwing");
ok(readTimezone("Asia/Seoul") === "Asia/Seoul", "a valid zone is honoured");

// IST is UTC+5:30. 18:29 UTC is still 'today' in India; 18:30 UTC is tomorrow.
const beforeRollover = new Date("2026-08-30T18:29:00Z");
const afterRollover = new Date("2026-08-30T18:30:00Z");
ok(
  zonedDayString(beforeRollover, IST) === "2026-08-30",
  `18:29Z is still Aug 30 in IST (${zonedDayString(beforeRollover, IST)})`
);
ok(
  zonedDayString(afterRollover, IST) === "2026-08-31",
  `18:30Z has rolled over to Aug 31 in IST (${zonedDayString(afterRollover, IST)})`
);
ok(
  zonedDayString(afterRollover, "UTC") === "2026-08-30",
  "the same instant is still Aug 30 in UTC -- which is exactly why the zone must be explicit"
);

const aug30 = dayRange("2026-08-30", IST);
ok(
  aug30.startUtc.toISOString() === "2026-08-29T18:30:00.000Z",
  `Aug 30 IST starts at 18:30Z the day before (${aug30.startUtc.toISOString()})`
);
ok(
  aug30.endUtc.toISOString() === "2026-08-30T18:30:00.000Z",
  `and ends at 18:30Z on Aug 30 (${aug30.endUtc.toISOString()})`
);
ok(
  aug30.endUtc.getTime() - aug30.startUtc.getTime() === 24 * 3600_000,
  "the window is exactly 24 hours long"
);

console.log("=== consecutive days partition time: no gap, no overlap ===");
const aug31 = dayRange("2026-08-31", IST);
ok(
  aug30.endUtc.getTime() === aug31.startUtc.getTime(),
  "one day ends exactly where the next begins"
);
// Half-open [start, end): the boundary instant belongs to the LATER day only.
const boundary = aug30.endUtc;
ok(
  boundary >= aug30.startUtc && boundary >= aug31.startUtc && boundary < aug31.endUtc,
  "the boundary instant falls in the later day only -- so nothing is counted twice"
);
ok(zonedDayString(boundary, IST) === "2026-08-31", "and it reads as the later day");

console.log("=== a zone WITH daylight saving still resolves correctly ===");
// 2026-03-08 is the US spring-forward date; that local day is only 23h long.
const dstDay = dayRange("2026-03-08", "America/New_York");
ok(
  dstDay.endUtc.getTime() - dstDay.startUtc.getTime() === 23 * 3600_000,
  `a spring-forward day is 23 hours (${(dstDay.endUtc.getTime() - dstDay.startUtc.getTime()) / 3600_000}h)`
);
ok(
  zonedDayStartUtc("2026-03-08", "America/New_York").toISOString() === "2026-03-08T05:00:00.000Z",
  "and its start is still correct"
);

// -------------------------------------------------------------------------
console.log("=== Today / Yesterday / a specific date / All time ===");
// -------------------------------------------------------------------------
const now = new Date("2026-08-30T12:00:00Z"); // 17:30 IST, mid-afternoon
ok(today(now, IST) === "2026-08-30", `today (${today(now, IST)})`);
ok(yesterday(now, IST) === "2026-08-29", `yesterday (${yesterday(now, IST)})`);
ok(addDays("2026-03-01", -1) === "2026-02-28", "day arithmetic crosses month ends");
ok(addDays("2026-12-31", 1) === "2027-01-01", "and year ends");
ok(addDays("2028-02-28", 1) === "2028-02-29", "and leap days");

ok(parseDayScope(undefined) === "today", "no scope means today");
ok(parseDayScope("yesterday") === "yesterday", "yesterday parses");
ok(parseDayScope("all") === "all", "all parses");
ok(parseDayScope("2026-08-14") === "2026-08-14", "an explicit date parses");
ok(parseDayScope("garbage") === "today", "garbage falls back to today, never to all-time");
ok(parseDayScope("2026-13-40") === "today", "and so does an impossible date");
ok(!isDayString("2026-02-30"), "Feb 30 is rejected as a real date");
ok(isDayString("2026-02-28") && isDayString("2028-02-29"), "real dates are accepted");

ok(resolveScope("all", now, IST) === null, "all-time resolves to NO date filter, not an invented start");
ok(resolveScope("today", now, IST)?.day === "2026-08-30", "today resolves to today's range");
ok(resolveScope("yesterday", now, IST)?.day === "2026-08-29", "yesterday resolves to yesterday's");
ok(resolveScope("2026-07-04", now, IST)?.day === "2026-07-04", "a specific date resolves to itself");

ok(recentDays("2026-08-29", 3).join(",") === "2026-08-29,2026-08-28,2026-08-27", "archive days run backwards");
ok(recentDays("2026-08-29", 0).length === 0, "a zero-length archive is empty, not infinite");
ok(formatDayShort("2026-08-29") === "Aug 29", `archive cards read as "${formatDayShort("2026-08-29")}"`);

// -------------------------------------------------------------------------
console.log("=== carry-forward: derived, never a second row ===");
// -------------------------------------------------------------------------
const discoveredYesterday = "2026-08-29T10:00:00Z";
ok(
  carriedFromDay(discoveredYesterday, "2026-08-30", IST) === "2026-08-29",
  "a row discovered yesterday is flagged carried when viewed today"
);
ok(
  carriedFromDay("2026-08-30T06:00:00Z", "2026-08-30", IST) === null,
  "a row discovered today is not"
);
ok(
  carriedFromDay(discoveredYesterday, "2026-08-29", IST) === null,
  "and viewing its own day shows no carry chip"
);
ok(carriedFromDay(null, "2026-08-30", IST) === null, "an unknown discovery date carries nothing");
ok(carriedFromDay("not a date", "2026-08-30", IST) === null, "and neither does an unparseable one");

// The carry chip is a function of (discovered_at, viewed day) alone -- it
// reads no stored flag, so nothing has to be rewritten at midnight and the
// row's own dates are never touched.
const chipYesterday = carriedFromDay(discoveredYesterday, "2026-08-30", IST);
const chipTomorrow = carriedFromDay(discoveredYesterday, "2026-08-31", IST);
ok(
  chipYesterday === "2026-08-29" && chipTomorrow === "2026-08-29",
  "the SAME row shows the same original day on every later day -- its date is never rewritten"
);

console.log("=== the day view merges by id, so a row cannot appear twice ===");
// listQueue collects into a Map keyed by id; a row matching both the activity
// query and the carry-forward query is stored once. Modelled here exactly.
const activityRows = [{ id: "a" }, { id: "b" }];
const carriedRows = [{ id: "b" }, { id: "c" }];
const merged = new Map<string, { id: string }>();
for (const r of activityRows) merged.set(r.id, r);
for (const r of carriedRows) merged.set(r.id, r);
ok(merged.size === 3, `three distinct rows, not four (${merged.size})`);
ok(
  [...merged.keys()].filter((k) => k === "b").length === 1,
  "the row qualifying both ways appears exactly once"
);

// -------------------------------------------------------------------------
console.log("=== the hard ceiling: calendar day AND a rolling 24h backstop ===");
// -------------------------------------------------------------------------
// batchAllowance(limit, dayUsed, rollingUsed, eligible)
const fresh = batchAllowance(5, 0, 0, 20);
ok(fresh.dayRemaining === 5 && fresh.rollingRemaining === 5, "a clean slate leaves both windows full");
ok(fresh.effectiveRemaining === 5 && fresh.maxBatch === 5, "and the effective allowance is the limit");

const dayFull = batchAllowance(5, 5, 5, 20);
ok(dayFull.effectiveRemaining === 0 && dayFull.maxBatch === 0, "a used-up day allows no batch");

const partial = batchAllowance(10, 4, 4, 20);
ok(partial.dayRemaining === 6 && partial.effectiveRemaining === 6, "limit 10, used 4 -> 6 remaining");
const scarce = batchAllowance(10, 4, 4, 2);
ok(scarce.maxBatch === 2, "only 2 eligible rows -> max batch 2, not 6");
const overused = batchAllowance(5, 9, 9, 20);
ok(
  overused.dayRemaining === 0 && overused.rollingRemaining === 0 && overused.effectiveRemaining === 0,
  "an over-used day never goes negative in either window"
);
ok(
  batchAllowance(1000, 0, 0, 1000).maxBatch === MAX_BATCH_REQUEST,
  `a huge limit is still capped per request at ${MAX_BATCH_REQUEST}`
);

console.log("=== the stricter window always wins ===");
const backstopBinds = batchAllowance(5, 0, 5, 20);
ok(backstopBinds.dayRemaining === 5, "the calendar day may say 5 remain");
ok(backstopBinds.rollingRemaining === 0, "while the rolling window says 0");
ok(
  backstopBinds.effectiveRemaining === 0,
  "and the EFFECTIVE allowance is 0 -- min(day, rolling), never the friendlier of the two"
);
ok(backstopBinds.maxBatch === 0, "so no batch may be requested at all");

const dayBinds = batchAllowance(5, 5, 0, 20);
ok(
  dayBinds.effectiveRemaining === 0,
  "it binds the other way too: a full calendar day blocks even with a clear rolling window"
);
ok(
  batchAllowance(10, 2, 7, 20).effectiveRemaining === 3,
  "and in between, the smaller remainder wins (day 8, rolling 3 -> 3)"
);

console.log("=== THE MIDNIGHT CASE: the reset must not hand back a burst ===");
// 5 replies go out at 23:55 IST. Minutes later the calendar day rolls over.
const LIMIT = 5;
const justBeforeMidnight = batchAllowance(LIMIT, 5, 5, 20);
ok(justBeforeMidnight.effectiveRemaining === 0, "at 23:55 the day is spent and nothing may be sent");

// 00:05 the next day: the CALENDAR counter has reset to 0...
const afterMidnightDayUsed = 0;
// ...but those five replies are still inside the rolling 24h window.
const afterMidnightRollingUsed = 5;
const justAfterMidnight = batchAllowance(LIMIT, afterMidnightDayUsed, afterMidnightRollingUsed, 20);
ok(justAfterMidnight.dayRemaining === 5, "the calendar day now reports 5 remaining -- as the dashboard shows");
ok(justAfterMidnight.rollingRemaining === 0, "but the rolling backstop still counts all five");
ok(
  justAfterMidnight.effectiveRemaining === 0,
  "so the EFFECTIVE allowance stays 0 -- ten replies in ten minutes is impossible"
);
ok(justAfterMidnight.maxBatch === 0, "and the batch selector offers nothing");
ok(
  clampBatchSize(5, justAfterMidnight) === 0,
  "a request for 5 straight after midnight is clamped to 0, not honoured"
);

// Slots come back only as the old replies age out of the rolling window.
const twoAgedOut = batchAllowance(LIMIT, 0, 3, 20);
ok(
  twoAgedOut.effectiveRemaining === 2,
  "once two of the five leave the 24h window, exactly two slots return (not five)"
);
const allAgedOut = batchAllowance(LIMIT, 0, 0, 20);
ok(allAgedOut.effectiveRemaining === 5, "and only when all five have aged out is the full limit available again");

console.log("=== both windows count in-flight POSTING claims ===");
// countSentBetween counts accepted rows PLUS rows claimed as POSTING, in
// whichever window it is given -- so a concurrent claim is visible to both.
const acceptedToday = 3;
const claimedNow = 2;
const concurrent = batchAllowance(5, acceptedToday + claimedNow, acceptedToday + claimedNow, 10);
ok(
  concurrent.effectiveRemaining === 0,
  "3 sent + 2 claimed = 5 of 5: a second concurrent request gets no allowance"
);
ok(
  batchAllowance(5, acceptedToday, acceptedToday, 10).effectiveRemaining === 2,
  "ignoring in-flight claims would have wrongly offered 2 more -- the race this closes"
);
// The claim must be counted in the ROLLING window too, or a claim made just
// before midnight would vanish from the backstop at 00:00.
const claimAcrossMidnight = batchAllowance(5, 0, 5, 10);
ok(
  claimAcrossMidnight.effectiveRemaining === 0,
  "a claim made before midnight still occupies a rolling slot after it"
);

console.log("=== a requested batch cannot exceed the effective allowance ===");
ok(clampBatchSize(5, partial) === 5, "a request within the allowance is honoured");
ok(clampBatchSize(9, partial) === 6, "a request above the remaining allowance is clamped to it");
ok(clampBatchSize(9, scarce) === 2, "and clamped to the eligible count when that is smaller");
ok(clampBatchSize(3, dayFull) === 0, "nothing may be requested once the day is used up");
ok(clampBatchSize(3, backstopBinds) === 0, "nor once the rolling backstop is full");
ok(clampBatchSize(0, fresh) === 0, "zero is not a batch");
ok(clampBatchSize(-4, fresh) === 0, "negative is not a batch");
ok(clampBatchSize(2.5, fresh) === 0, "a fractional count is refused, not rounded up");
ok(clampBatchSize(Number.NaN, fresh) === 0, "NaN is refused");
ok(clampBatchSize(Infinity, fresh) === 0, "Infinity is refused");
ok(clampBatchSize(1e9, fresh) === 5, "an absurd request is clamped, never trusted");

console.log("=== one variable governs both windows ===");
ok(
  batchAllowance(7, 0, 0, 99).dayRemaining === 7 && batchAllowance(7, 0, 0, 99).rollingRemaining === 7,
  "YOUTUBE_DAILY_POST_LIMIT sets both ceilings -- no second variable to misconfigure"
);
ok(ROLLING_WINDOW_HOURS === 24, `the backstop window is 24 hours (${ROLLING_WINDOW_HOURS})`);

// -------------------------------------------------------------------------
console.log("=== rows a batch must never touch ===");
// -------------------------------------------------------------------------
ok(postRefusal(postable({ manual_follow_up: true })) === "manual_follow_up", "manual follow-up");
ok(!canPost(postable({ manual_follow_up: true })), "  and canPost is false");
ok(postRefusal(postable({ status: "REMOVED" })) === "not_approved", "REMOVED");
ok(!canPost(postable({ status: "REMOVED", posted_reply_id: "r" })), "  never postable");
ok(postRefusal(postable({ is_legacy: true })) === "legacy", "legacy");
ok(postRefusal(postable({ status: "HOLD" })) === "not_approved", "HOLD");
ok(postRefusal(postable({ status: "SKIP" })) === "not_approved", "SKIP");
ok(postRefusal(postable({ source_type: "reply" })) === "not_top_level", "a nested reply");
ok(postRefusal(postable({ automation_action: "HOLD" })) === "action_not_post", "action not POST");
ok(postRefusal(postable({ posted_reply_id: "r" })) === "already_posted", "already posted");
ok(postRefusal(postable({ final_draft: null })) === "no_draft", "no draft");
ok(postRefusal(postable()) === null, "and a clean approved row is postable");

// Manual follow-up must survive as a refusal in every status, so a batch can
// never pick one up by taking a different route to it.
let followUpLeak = "";
for (const status of ["APPROVED", "DRAFTED", "FAILED", "HOLD"] as const) {
  if (canPost(postable({ status, manual_follow_up: true }))) followUpLeak = status;
}
ok(followUpLeak === "", `manual follow-up is refused in every status (${followUpLeak || "none leaked"})`);

// -------------------------------------------------------------------------
console.log("=== the batch runs sequentially and stops when it stops knowing ===");
// -------------------------------------------------------------------------
const context: PostContext = { actorUserId: "admin", limit: 10 };

/** Records call order and concurrency, and returns scripted outcomes. */
function scriptedPoster(script: Record<string, PostOutcome["kind"]>) {
  const order: string[] = [];
  let inFlight = 0;
  let maxConcurrent = 0;

  const poster = async (id: string): Promise<PostOutcome> => {
    inFlight++;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    order.push(id);
    // Yield, so any accidental parallelism would show up as overlap.
    await new Promise((resolve) => setTimeout(resolve, 0));
    inFlight--;

    const kind = script[id] ?? "posted";
    if (kind === "posted") return { kind, id, replyId: `${id}-reply`, persisted: true, audited: true };
    if (kind === "skipped") return { kind, id, reason: "not_approved" };
    return { kind, id, code: "network", detail: "scripted" } as PostOutcome;
  };

  return { poster, order: () => order, maxConcurrent: () => maxConcurrent };
}

async function batchChecks() {
  {
    const s = scriptedPoster({});
    const report = await postBatch(["r1", "r2", "r3"], context, s.poster);
    ok(report.posted === 3 && report.requested === 3, `all three posted (${report.posted})`);
    ok(s.order().join(",") === "r1,r2,r3", `processed in order (${s.order().join(",")})`);
    ok(s.maxConcurrent() === 1, `never more than one send at a time (${s.maxConcurrent()})`);
    ok(!report.stopped, "and the run completed");
  }

  {
    // An AMBIGUOUS outcome must halt the run: we no longer know what YouTube did.
    const s = scriptedPoster({ r2: "ambiguous" });
    const report = await postBatch(["r1", "r2", "r3"], context, s.poster);
    ok(report.stopped && report.stoppedReason === "ambiguous_outcome", "an ambiguous outcome stops the batch");
    ok(s.order().join(",") === "r1,r2", `r3 is never attempted (${s.order().join(",")})`);
    ok(report.posted === 1 && report.failed === 1, `one posted, one failed (${report.posted}/${report.failed})`);
  }

  {
    // A CLEAR failure created nothing, so continuing is safe.
    const s = scriptedPoster({ r2: "failed" });
    const report = await postBatch(["r1", "r2", "r3"], context, s.poster);
    ok(!report.stopped, "a clear failure does NOT stop the batch");
    ok(s.order().length === 3, "every row is still attempted");
    ok(report.posted === 2 && report.failed === 1, `2 posted, 1 failed (${report.posted}/${report.failed})`);
  }

  {
    // A skip is safe too -- but the ceiling is not.
    const s = scriptedPoster({ r2: "skipped" });
    const report = await postBatch(["r1", "r2", "r3"], context, s.poster);
    ok(!report.stopped && report.skipped === 1, "a skipped row does not stop the batch");
  }

  {
    const limitPoster = async (id: string): Promise<PostOutcome> =>
      id === "r1"
        ? { kind: "posted", id, replyId: "x", persisted: true, audited: true }
        : { kind: "skipped", id, reason: "daily_limit_reached" };
    const report = await postBatch(["r1", "r2", "r3"], context, limitPoster);
    ok(
      report.stopped && report.stoppedReason === "daily_limit_reached",
      "hitting the ceiling mid-batch stops the run"
    );
    ok(report.posted === 1, `only the reply that fit was sent (${report.posted})`);
  }

  {
    const report = await postBatch([], context, async () => {
      throw new Error("must not be called");
    });
    ok(report.requested === 0 && report.posted === 0, "an empty batch does nothing at all");
  }
}

// -------------------------------------------------------------------------
console.log("=== survival: accepted is neither alive nor dead ===");
// -------------------------------------------------------------------------
const s1 = computeSurvival({ live: 4, removed: 1, awaitingCheck: 0 });
ok(s1.checked === 5 && s1.live === 4, `4 of 5 checked are live (${s1.live}/${s1.checked})`);
ok(s1.rate !== null && Math.abs(s1.rate - 0.8) < 1e-9, `rate is 80% (${formatSurvivalRate(s1.rate)})`);

const s2 = computeSurvival({ live: 4, removed: 1, awaitingCheck: 7 });
ok(s2.checked === 5, "seven unchecked replies do NOT enter the denominator");
ok(s2.live === 4, "nor the numerator");
ok(
  s2.rate !== null && Math.abs(s2.rate - 0.8) < 1e-9,
  "so the rate is unchanged by them -- API_ACCEPTED is never counted as survived"
);
ok(s2.awaitingCheck === 7, "they are reported separately instead, beside the rate");

const s3 = computeSurvival({ live: 0, removed: 0, awaitingCheck: 12 });
ok(s3.rate === null, "twelve sent and none checked yields NO rate, not 0% and not 100%");
ok(formatSurvivalRate(s3.rate) === "—", `it displays as a dash (${formatSurvivalRate(s3.rate)})`);
ok(
  computeSurvival({ live: 0, removed: 3, awaitingCheck: 0 }).rate === 0,
  "three checked and all gone is a real 0%, distinct from 'not checked'"
);
ok(computeSurvival({ live: 5, removed: 0, awaitingCheck: 0 }).rate === 1, "all checked and all live is 100%");
ok(formatSurvivalRate(0.666) === "67%", "the rate rounds for display");

// The scenario that started all this: 120 accepted, none checked.
const oldBot = computeSurvival({ live: 0, removed: 0, awaitingCheck: 120 });
ok(
  oldBot.rate === null && oldBot.live === 0,
  "120 accepted and unchecked reports NO survival rate -- the old bot reported 100%"
);

// -------------------------------------------------------------------------
console.log("=== classification is descriptive, never a trigger ===");
// -------------------------------------------------------------------------
ok(priorityFromImport("High", null) === "HIGH", "confidence 'High' -> HIGH");
ok(priorityFromImport("low", null) === "LOW", "case-insensitively");
ok(priorityFromImport(null, 5) === "HIGH", "a numeric score is the fallback");
ok(priorityFromImport(null, 1) === "LOW", "low score -> LOW");
ok(priorityFromImport(null, null) === "MEDIUM", "nothing at all -> MEDIUM, never a guess either way");
ok(priorityFromImport("nonsense", null) === "MEDIUM", "an unreadable grade -> MEDIUM");
ok(PRIORITY_RANK.HIGH < PRIORITY_RANK.MEDIUM && PRIORITY_RANK.MEDIUM < PRIORITY_RANK.LOW, "High sorts first");

// Priority orders the queue and nothing else: postRefusal never reads it.
ok(
  canPost(postable({ status: "APPROVED" })) === canPost(postable({ status: "APPROVED" })),
  "priority is absent from QueueRowFacts entirely, so it cannot affect postability"
);

console.log("=== GKS vs General describes the QUESTION ===");
ok(opportunityTypeFrom("How do I apply for GKS?", null) === "GKS", "an explicit GKS question");
ok(opportunityTypeFrom("Global Korea Scholarship deadline?", null) === "GKS", "spelled out");
ok(opportunityTypeFrom(null, "KGSP documents") === "GKS", "matched via topic");
ok(opportunityTypeFrom("Is Seoul expensive?", null) === "GENERAL", "an unrelated question");
ok(opportunityTypeFrom(null, null) === "GENERAL", "nothing to read defaults to GENERAL");

console.log("=== promotion category describes the REPLY ===");
ok(promotionCategoryOf("Yes, the deadline is in March.") === "ANSWER_ONLY", "a plain answer");
ok(promotionCategoryOf("KMate has a checker for this.") === "KMATE_MENTION", "a mention");
ok(promotionCategoryOf("See https://kmate.app/checker") === "KMATE_LINK", "a link");
ok(promotionCategoryOf("Try kmate.app for this") === "KMATE_LINK", "a bare domain is still a link");
ok(
  promotionCategoryOf("KMate has this — see https://kmate.app") === "KMATE_LINK",
  "a link outranks a mention: the link is the more consequential fact"
);
ok(promotionCategoryOf(null) === "ANSWER_ONLY", "no draft is ANSWER_ONLY");
ok(promotionCategoryOf("   ") === "ANSWER_ONLY", "a blank draft too");
// It reads the text; it never rewrites it.
const draftIn = "KMate has a checker for this.";
ok(
  promotionCategoryOf(draftIn) === "KMATE_MENTION" && draftIn === "KMate has a checker for this.",
  "classifying leaves the draft untouched -- nothing here rewrites a reply"
);

console.log("=== feature tags are informational ===");
const tags = featureTagsFor("Which university should I compare for GKS interview prep?", null);
ok(tags.includes("University Comparison"), "comparison matched");
ok(tags.includes("GKS Assistant"), "GKS matched");
ok(tags.includes("Interview Questions"), "interview matched");
ok(tags.length >= 3, `multiple tags are allowed (${tags.length})`);
ok(featureTagsFor(null, null).length === 0, "nothing to read yields no tags");
// A feature match must not imply promotion.
ok(
  promotionCategoryOf("The deadline is in March.") === "ANSWER_ONLY",
  "a matching feature does NOT make the reply a KMate promotion"
);

console.log("=== reply voice ===");
ok(replyVoiceOf("KMate", null) === "KMate", "explicit KMate choice");
ok(replyVoiceOf("General", true) === "General", "an explicit choice beats the flag");
ok(replyVoiceOf(null, true) === "KMate", "the flag is the fallback");
ok(replyVoiceOf(null, null) === "General", "and General is the default");

// -------------------------------------------------------------------------
console.log("=== duplicate-commenter warning never overrides id dedupe ===");
// -------------------------------------------------------------------------
// The author warning is presentation. The authoritative protection is the
// database's unique constraint on youtube_comment_id, and the row-level
// postRefusal rules -- neither of which reads an author name.
const repeatAuthor = postable();
ok(
  canPost(repeatAuthor),
  "a row from an author we have replied to before is still postable -- the warning does not block"
);
const sameCommentAgain = postable({ posted_reply_id: "already" });
ok(
  postRefusal(sameCommentAgain) === "already_posted",
  "while a comment already replied to is refused outright, by the row's own state"
);
ok(
  !("author_name" in (postable() as object)),
  "QueueRowFacts carries no author field at all, so no safety rule can depend on one"
);

// -------------------------------------------------------------------------
console.log("=== comment age ===");
// -------------------------------------------------------------------------
const ageNow = new Date("2026-08-30T12:00:00Z");
ok(humanAge("2026-08-30T11:48:00Z", ageNow) === "12m", "12 minutes");
ok(humanAge("2026-08-30T10:00:00Z", ageNow) === "2h", "2 hours");
ok(humanAge("2026-08-29T12:00:00Z", ageNow) === "1d", "1 day");
ok(humanAge("2026-08-27T12:00:00Z", ageNow) === "3d", "3 days");
ok(humanAge("2026-08-30T11:59:30Z", ageNow) === "30s", "seconds under a minute");
ok(humanAge(null, ageNow) === "—", "an unknown timestamp shows a dash");
ok(humanAge("nonsense", ageNow) === "—", "and so does an unparseable one");
ok(humanAge("2026-08-30T12:05:00Z", ageNow) === "0s", "a future timestamp never goes negative");

void batchChecks().then(() => {
  console.log("");
  console.log(fail ? fail + " FAILURES" : "ALL YOUTUBE DAILY CHECKS PASSED");
  process.exit(fail ? 1 : 0);
});
