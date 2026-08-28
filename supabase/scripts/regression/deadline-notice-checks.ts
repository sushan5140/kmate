/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Deadline + notice matching checks.
 *
 * Run with:  npx tsx --conditions react-server supabase/scripts/regression/deadline-notice-checks.ts
 *
 * Part 1 is the suite delivered with the dataset, unchanged except for its
 * import paths. Part 2 was added during integration and covers the rule the
 * whole feature turns on: a deadline is shown only because an official source
 * states it, never inferred from another cycle and never counted down after it
 * has passed.
 */
import { strict as assert } from "node:assert";
import data from "@/data/deadlines-notices-data.json";
import { matchDeadlineNoticeFeed, nextVerifiedDeadline } from "@/lib/deadlines/matcher";

const dataset = data as any;

const u = matchDeadlineNoticeFeed(dataset, {
  program: "GKS-U",
  track: "embassy",
  cycle: "2026",
  now: new Date("2026-08-27T00:00:00Z")
});
assert.equal(u.upcoming.length, 0);
assert(u.historical.length >= 1);
assert(u.notices.some((n: any) => n.id === "notice_u_final"));

const g = matchDeadlineNoticeFeed(dataset, {
  program: "GKS-G",
  track: "university",
  cycle: "2026",
  now: new Date("2026-08-27T00:00:00Z")
});
assert.equal(g.upcoming.length, 0);
assert(g.notices.some((n: any) => n.id === "notice_g_university_r2"));
assert(g.notices.some((n: any) => n.id === "notice_g_final"));

assert.equal(nextVerifiedDeadline(dataset, {
  program: "GKS-U",
  track: "embassy",
  cycle: "2027",
  now: new Date("2026-08-27T00:00:00Z")
}), null);

console.log("deadline/notice tests passed");

EXTRA_CHECKS();

// ---------------------------------------------------------------------------
// Part 2 -- added during integration
// ---------------------------------------------------------------------------

function EXTRA_CHECKS() {
  let fail = 0;
  const ok = (c: boolean, m: string) => {
    console.log((c ? "  PASS  " : "  FAIL  ") + m);
    if (!c) fail++;
  };
  const NOW = new Date("2026-08-27T00:00:00Z");
  const feed = (program: any, track: any, cycle: string, now: Date = NOW) =>
    matchDeadlineNoticeFeed(dataset, { program, track, cycle, now });
  const ids = (list: any[]) => list.map((x) => x.id);

  console.log("");
  console.log("=== 1/2/11. today's date: nothing upcoming, everything past stays past ===");
  const ue = feed("GKS-U", "embassy", "2026");
  ok(ue.upcoming.length === 0, "GKS-U Embassy 2026 has 0 upcoming deadlines");
  ok(ue.historical.length === 3, "and 3 historical ones (got " + ue.historical.length + ")");
  ok(ids(ue.historical).includes("gks_u_2026_expected_graduation"), "Dec 31 expected-graduation record present as historical");
  ok(ids(ue.historical).includes("gks_u_2026_final_university_choice"), "Jan 2 final-choice record present as historical");
  ok(ue.historical.every((d: any) => d.isPast && d.daysUntil < 0), "every historical record is flagged past with a negative day count");
  ok(ue.upcoming.every((d: any) => d.daysUntil >= 0), "no upcoming record could ever carry a negative countdown");
  ok(nextVerifiedDeadline(dataset, { program: "GKS-U", track: "embassy", cycle: "2026", now: NOW }) === null,
     "so there is no 'next verified deadline' to show");

  console.log("=== 3/4. GKS-U notice scoping ===");
  const un = ids(feed("GKS-U", "embassy", "2026").notices);
  ok(un.includes("notice_u_final"), "Embassy sees the program-wide final result (track: null)");
  ok(un.includes("notice_u_embassy_r3"), "and its own third-round result");
  ok(!un.includes("notice_u_university_r2"), "but NOT the University Track second-round result");
  const uu = ids(feed("GKS-U", "university", "2026").notices);
  ok(uu.includes("notice_u_university_r2"), "University Track sees its own second-round result");
  ok(!uu.includes("notice_u_embassy_r3"), "and NOT the Embassy third-round result");
  ok(uu.includes("notice_u_guidelines") && uu.includes("notice_u_final"), "both tracks see the track-null guideline and final result");

  console.log("=== 5/6/7. GKS-G notice scoping ===");
  const ge = ids(feed("GKS-G", "embassy", "2026").notices);
  ok(ge.includes("notice_g_embassy_r2"), "GKS-G Embassy sees its second-round result");
  ok(!ge.includes("notice_g_university_r2"), "and not the University Track one");
  const gu = ids(feed("GKS-G", "university", "2026").notices);
  ok(gu.includes("notice_g_university_r2"), "GKS-G University sees the revised second-round result");
  ok(!gu.includes("notice_g_embassy_r2"), "and not the Embassy one");
  for (const [label, list] of [["Embassy", ge], ["University", gu]] as const) {
    ok(list.includes("notice_g_final"), `GKS-G ${label} sees the program-wide final result`);
    ok(list.includes("notice_g_invitation_delay"), `GKS-G ${label} sees the program-wide schedule change`);
  }
  ok(!ge.includes("notice_u_final") && !gu.includes("notice_u_final"), "no GKS-U notice leaks into a GKS-G feed");

  console.log("=== 8. a cycle with no records never falls back ===");
  for (const cycle of ["2027", "2028", "2025"]) {
    const f = feed("GKS-U", "embassy", cycle);
    ok(f.upcoming.length === 0 && f.historical.length === 0 && f.notices.length === 0,
       `cycle ${cycle}: nothing returned (${f.upcoming.length}/${f.historical.length}/${f.notices.length})`);
    ok(nextVerifiedDeadline(dataset, { program: "GKS-U", track: "embassy", cycle, now: NOW }) === null,
       `  and no next deadline is invented for ${cycle}`);
  }
  ok(feed("GKS-U", "embassy", "2027").notices.length === 0, "a future cycle never borrows 2026's notices");

  console.log("=== 3. notices are newest first ===");
  const order = feed("GKS-G", "university", "2026").notices.map((n: any) => n.published_at);
  ok(JSON.stringify(order) === JSON.stringify([...order].sort().reverse()), "sorted newest first: " + JSON.stringify(order));

  console.log("=== 12. every record resolves to an official source ===");
  const all = [...feed("GKS-U", "embassy", "2026").notices, ...feed("GKS-G", "university", "2026").notices,
               ...feed("GKS-U", "embassy", "2026").historical];
  ok(all.every((x: any) => x.source && /^https:\/\//.test(x.source.url)), "every matched record carries an https source URL");
  ok(all.every((x: any) => x.source.publisher && x.source.title), "and a publisher and title to label it with");

  console.log("=== 6. no university-specific records exist, so none can be shown ===");
  ok((dataset.deadlines as any[]).every((d) => !("university" in d)), "no deadline record carries a university field");
  ok((dataset.notices as any[]).every((n) => !("university" in n)), "no notice record carries a university field");

  console.log("=== a deadline that is genuinely ahead is counted correctly ===");
  // Same dataset, evaluated before the dates passed -- proves the countdown
  // works and is simply empty today, rather than being broken.
  const past = feed("GKS-U", "embassy", "2026", new Date("2025-12-01T00:00:00Z"));
  ok(past.upcoming.length === 3, "on 2025-12-01 all three GKS-U dates are upcoming (got " + past.upcoming.length + ")");
  ok(past.historical.length === 0, "and none are historical");
  const nextThen = nextVerifiedDeadline(dataset, { program: "GKS-U", track: "embassy", cycle: "2026", now: new Date("2025-12-01T00:00:00Z") });
  ok(nextThen !== null && nextThen.deadline === "2025-12-31", "the nearest one is picked first: " + nextThen?.deadline);
  ok(nextThen !== null && nextThen.daysUntil > 0, "with a positive countdown (" + nextThen?.daysUntil + " days)");

  console.log("=== dataset policy flags are intact ===");
  ok(dataset.policy.official_only === true, "official_only");
  ok(dataset.policy.never_infer_future_cycle_dates === true, "never_infer_future_cycle_dates");
  ok(dataset.policy.expired_deadlines_are_historical === true, "expired_deadlines_are_historical");
  ok(dataset.generated_for_cycle === "2026", "generated_for_cycle is 2026");

  console.log("");
  console.log(fail ? fail + " FAILURES" : "ALL DEADLINE/NOTICE CHECKS PASSED");
  process.exit(fail ? 1 : 0);
}
