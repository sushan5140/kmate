/**
 * Scholarship deadline extraction + lifecycle checks.
 *
 * Run with:  npx tsx --conditions react-server supabase/scripts/regression/scholarship-deadline-checks.ts
 *
 * The property under test: a scholarship gets a `fixed` deadline ONLY when
 * the page states a complete calendar date labelled with closing wording.
 * Every other shape -- a month with no day, a missing year, a result or
 * interview date, an open-ended range, two contradictory closing dates --
 * must leave the deadline null. A wrong deadline is worse than none.
 */
import { extractScholarshipDeadline, findCompleteDates } from "@/lib/scholarships/deadline-extract";
import { classifyScholarshipLifecycle } from "@/lib/scholarships/lifecycle";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + m);
  if (!c) fail++;
};

// -------------------------------------------------------------------------
console.log("=== 4. an explicit fixed deadline is extracted ===");
// -------------------------------------------------------------------------
const explicit = extractScholarshipDeadline("Application deadline: 15 September 2026. Submit via the portal.");
ok(explicit.deadline === "2026-09-15", `date read verbatim: ${explicit.deadline}`);
ok(explicit.deadlineType === "fixed", `type fixed (${explicit.deadlineType})`);
ok(explicit.confidence >= 0.9, `confidence ${explicit.confidence}`);
ok(!!explicit.evidence && /15 September 2026/.test(explicit.evidence!), `evidence quotes the source: ${JSON.stringify(explicit.evidence)}`);
ok(!!explicit.deadlineLabel, `label captured: ${JSON.stringify(explicit.deadlineLabel)}`);

for (const [text, expected] of [
  ["Applications close on 2026-11-30.", "2026-11-30"],
  ["Closing date: November 30, 2026", "2026-11-30"],
  ["Documents must be received by 1 March 2027.", "2027-03-01"],
  ["Deadline: 2026.12.01", "2026-12-01"],
  ["Applications must be submitted no later than 5 May 2026.", "2026-05-05"],
] as const) {
  const r = extractScholarshipDeadline(text);
  ok(r.deadline === expected && r.deadlineType === "fixed", `"${text.slice(0, 44)}..." -> ${r.deadline}`);
}

// -------------------------------------------------------------------------
console.log("=== 5/8. ambiguous and incomplete dates stay null ===");
// -------------------------------------------------------------------------
const ambiguous: [string, string][] = [
  ["Application Period : January", "month only, no day or year"],
  ["Application deadline: 15 September", "MISSING YEAR -- never supplied"],
  ["Applications close in early autumn.", "prose, no date at all"],
  ["Deadline: TBA", "explicitly to-be-announced"],
  ["Apply during the first semester.", "no date"],
  ["Application deadline: 2026-02-31", "impossible calendar date"],
];
for (const [text, why] of ambiguous) {
  const r = extractScholarshipDeadline(text);
  ok(r.deadline === null, `null: "${text}" (${why})`);
  ok(r.deadlineType !== "fixed", `  and never typed fixed (${r.deadlineType})`);
}
ok(findCompleteDates("15 September").length === 0, "a date with no year is not even a candidate");
ok(findCompleteDates("15 September 2026").length === 1, "with a year it is");

// -------------------------------------------------------------------------
console.log("=== application period: closed range resolves to its END, open range refused ===");
// -------------------------------------------------------------------------
const closed = extractScholarshipDeadline("Application period: 1 March 2026 ~ 31 March 2026");
ok(closed.deadline === "2026-03-31", `closed range -> end date (${closed.deadline})`);
ok(closed.deadlineType === "fixed", "  typed fixed");
const closed2 = extractScholarshipDeadline("Applications close 2026-03-01 - 2026-03-31");
ok(closed2.deadline === "2026-03-31", `dash range -> end (${closed2.deadline})`);
const open = extractScholarshipDeadline("Application period: from 1 March 2026");
ok(open.deadline === null, `open-ended range refused (${open.deadline}) -- its end is unstated`);
const bareRange = extractScholarshipDeadline("Application period: 1 March 2026 ~ 31 March 2026 for all applicants");
ok(bareRange.deadline === "2026-03-31", "a labelled range still resolves");

// -------------------------------------------------------------------------
console.log("=== 21/result + interview + other non-deadline dates are refused ===");
// -------------------------------------------------------------------------
const nonDeadline: [string, string][] = [
  ["Results will be announced on 15 December 2026.", "result announcement"],
  ["Interviews will be held on 3 October 2026.", "interview"],
  ["Orientation begins 1 September 2026.", "orientation"],
  ["The semester starts on 2 March 2027.", "semester start"],
  ["Successful applicants will be notified on 20 November 2026.", "notification"],
  ["The award was announced on 5 May 2020.", "historical announcement"],
];
for (const [text, why] of nonDeadline) {
  const r = extractScholarshipDeadline(text);
  ok(r.deadline === null, `refused (${why}): "${text.slice(0, 46)}..."`);
}
// The decisive case: both a deadline word and a result date in one sentence.
const mixed = extractScholarshipDeadline("Results are announced on 15 December 2026; the application deadline was earlier.");
ok(mixed.deadline === null, "a result date near the word 'deadline' is still refused");

// -------------------------------------------------------------------------
console.log("=== 9. multiple dates ===");
// -------------------------------------------------------------------------
const multi = extractScholarshipDeadline(
  "Application deadline: 15 September 2026. Results will be announced on 1 December 2026."
);
ok(multi.deadline === "2026-09-15", `the labelled deadline wins over the result date (${multi.deadline})`);
const conflicting = extractScholarshipDeadline(
  "Application deadline: 15 September 2026. Applications close on 30 September 2026."
);
ok(conflicting.deadline === null, `two contradictory closing dates -> null (${conflicting.deadline}), never a guess`);
ok(conflicting.deadlineType === null, "  and no type is asserted");

// -------------------------------------------------------------------------
console.log("=== 22. extension wording ===");
// -------------------------------------------------------------------------
const extended = extractScholarshipDeadline("The application deadline has been extended to 30 October 2026.");
ok(extended.deadline === "2026-10-30", `extension date read (${extended.deadline})`);
ok(extended.deadlineType === "fixed", "  typed fixed");
const extendedUntil = extractScholarshipDeadline("Applications extended until 5 November 2026.");
ok(extendedUntil.deadline === "2026-11-05", `"extended until" read (${extendedUntil.deadline})`);

// -------------------------------------------------------------------------
console.log("=== 6. non-date phrasings keep their own meaning ===");
// -------------------------------------------------------------------------
const admission = extractScholarshipDeadline("Same as Admission Application. No separate deadline applies.");
ok(admission.deadlineType === "admission_schedule", `admission schedule (${admission.deadlineType})`);
ok(admission.deadline === null, "  with no date");
const auto = extractScholarshipDeadline("Awarded automatically to all admitted students. No separate application.");
ok(auto.deadlineType === "automatic", `automatic (${auto.deadlineType})`);
ok(auto.deadline === null, "  with no date");
const nothing = extractScholarshipDeadline("");
ok(nothing.deadline === null && nothing.deadlineType === null, "empty text yields nothing at all");

// The admission-schedule sentence must never be upgraded by a stray date.
const admissionWithDate = extractScholarshipDeadline(
  "Same as Admission Application. The academic year begins 1 March 2027."
);
ok(admissionWithDate.deadline === null, "an academic-year date does not become an admission deadline");

// -------------------------------------------------------------------------
console.log("=== 7/8/9. lifecycle classification ===");
// -------------------------------------------------------------------------
const TODAY = new Date("2026-08-29T00:00:00Z");
const life = (deadline: string | null, type: string | null) =>
  classifyScholarshipLifecycle({ deadline, deadline_type: type }, TODAY);

ok(life("2026-12-31", "fixed").status === "active", "future fixed deadline -> active");
ok(life("2026-12-31", "fixed").isActive === true, "  and is_active true");
ok(life("2026-09-02", "fixed").status === "expiring_soon", "within 7 days -> expiring_soon");
ok(life("2026-09-02", "fixed").isActive === true, "  still active");
ok(life("2026-08-29", "fixed").status === "expiring_soon", "today -> expiring_soon, not yet expired");
ok(life("2026-08-28", "fixed").status === "expired", "yesterday -> expired");
ok(life("2026-08-28", "fixed").isActive === false, "  and is_active false");

console.log("=== 6. a null deadline NEVER falsely expires ===");
ok(life(null, null).status === "active", "null deadline + null type -> active");
ok(life(null, "admission_schedule").status === "active", "admission_schedule -> active, never expires");
ok(life(null, "automatic").status === "active", "automatic -> active, never expires");
ok(life(null, "fixed").status === "active", "type fixed but NO date -> active (cannot expire without a date)");
for (const t of [null, "admission_schedule", "automatic"]) {
  ok(life(null, t).isActive === true, `  ${t ?? "null"} stays is_active`);
}

console.log("=== the derived check is a pure function of (deadline, type, today) ===");
ok(life("2026-08-28", "fixed").status === "expired" && life("2026-08-28", "fixed").status === "expired", "deterministic");
ok(
  classifyScholarshipLifecycle({ deadline: "2026-08-28", deadline_type: "fixed" }, new Date("2026-08-27T00:00:00Z")).status !== "expired",
  "the same row is NOT expired when evaluated a day earlier -- date-relative, not stored"
);

console.log("");
console.log(fail ? fail + " FAILURES" : "ALL SCHOLARSHIP DEADLINE CHECKS PASSED");
process.exit(fail ? 1 : 0);
