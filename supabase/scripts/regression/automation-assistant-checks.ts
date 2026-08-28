/**
 * Automation foundation + Deadline Verification Assistant checks.
 *
 * Run with:  npx tsx --conditions react-server supabase/scripts/regression/automation-assistant-checks.ts
 *
 * The rule everything here defends: an approved notice does not create a
 * deadline, and a candidate date does not create a deadline. Only the strict
 * gate passing in full, or an explicit admin decision, may do that.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./_env";
import { parseProposal, sanitizeText } from "@/lib/assistant/schema";
import { proposeFromCandidate, extractCycle, extractScope } from "@/lib/assistant/deadline-assistant";
import { evaluateGate } from "@/lib/assistant/gate";
import { reconcile, findDuplicate, scopeKey, type ExistingDeadline } from "@/lib/assistant/dedupe";
import { AUTO_VERIFY_MIN_CONFIDENCE } from "@/lib/assistant/config";
import type { CandidateDate } from "@/lib/notices/review-schema";
import { DAILY_STAGE_ORDER } from "@/lib/automation/daily";
import { mergeWithStatic, participatesInMatching, isCountdownType, findStaticLiveConflicts, type LiveVerifiedDeadline } from "@/lib/deadlines/live-schema";
import { matchDeadlineNoticeFeed } from "@/lib/deadlines/matcher";
import { deadlineNoticeDataset } from "@/lib/deadlines";
import { extractCandidateDates } from "@/lib/notices/extract-dates";

const env = loadEnvLocal();
process.env.SUPABASE_URL ??= env.NEXT_PUBLIC_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL ??= env.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY ??= env.SUPABASE_SERVICE_ROLE_KEY;

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + m);
  if (!c) fail++;
};
const REPO = path.join(__dirname, "..", "..", "..");

const cand = (over: Partial<CandidateDate> = {}): CandidateDate => ({
  date: "2026-10-31",
  kind: "application_deadline",
  context: "Applications must be received no later than 2026-10-31.",
  rawMatch: "2026-10-31",
  sourceUrl: "https://www.studyinkorea.go.kr/en/x?nttId=900",
  confidence: "high",
  ...over,
});

const notice = (over: Partial<Parameters<typeof proposeFromCandidate>[0]["notice"]> = {}) => ({
  title: "2026 Global Korea Scholarship Undergraduate Application Guidelines",
  body: "Applications must be received no later than 2026-10-31.",
  sourceUrl: "https://www.studyinkorea.go.kr/en/x?nttId=900",
  publishedAt: "2026-08-01",
  approvedProgram: "GKS-U" as const,
  approvedTrack: "embassy" as const,
  ...over,
});

const gateCtx = (over: Partial<Parameters<typeof evaluateGate>[1]> = {}) => ({
  noticeApproved: true,
  officialSource: true,
  existingVerifiedDate: null,
  conflictingCandidateDates: [],
  ...over,
});

// -------------------------------------------------------------------------
console.log("=== 1/2. exactly one orchestrator cron is scheduled ===");
// -------------------------------------------------------------------------
const vercel = JSON.parse(fs.readFileSync(path.join(REPO, "vercel.json"), "utf-8"));
const scheduled: string[] = (vercel.crons ?? []).map((c: { path: string }) => c.path);
ok(scheduled.length === 1, `exactly one scheduled cron (${scheduled.length}) -- no deployment-plan dependency`);
ok(scheduled[0] === "/api/cron/daily-maintenance", `it is the orchestrator (${scheduled[0]})`);
ok(/^\d+ \d+ \* \* \*$/.test(vercel.crons[0].schedule), `once daily (${vercel.crons[0].schedule})`);
ok(fs.existsSync(path.join(REPO, "app/api/cron/daily-maintenance/route.ts")), "the orchestrator route exists");

console.log("=== 2. orchestrator stage order ===");
ok(
  JSON.stringify(DAILY_STAGE_ORDER) ===
    JSON.stringify(["notice-scout", "scholarships", "scholarships-freshness", "deadline-assistant"]),
  `stages run in order: ${DAILY_STAGE_ORDER.join(" -> ")}`
);
ok(
  DAILY_STAGE_ORDER.indexOf("scholarships-freshness") > DAILY_STAGE_ORDER.indexOf("scholarships"),
  "freshness runs AFTER scholarship discovery, so it sees that run's writes"
);
ok(
  DAILY_STAGE_ORDER.indexOf("deadline-assistant") > DAILY_STAGE_ORDER.indexOf("notice-scout"),
  "the assistant runs after the scout, so it sees newly approved notices"
);

console.log("=== every superseded route still exists for manual use ===");
for (const job of ["notice-scout", "notices", "scholarships", "scholarships-freshness", "deadline-assistant"]) {
  ok(fs.existsSync(path.join(REPO, "app/api/cron", job, "route.ts")), `  /api/cron/${job} still available`);
  ok(!scheduled.includes(`/api/cron/${job}`), `  and is NOT separately scheduled (no duplicate fetches)`);
}

console.log("=== 3. a stage failure is recorded, and later stages still run ===");
const dailySrc = fs.readFileSync(path.join(REPO, "lib/automation/daily.ts"), "utf-8");
ok(/recordRun\(stage\.name/.test(dailySrc), "each stage records its own automation_runs row");
ok(!/break;/.test(dailySrc), "no early break -- one failing stage does not skip the rest");
ok(/ok: error === null/.test(dailySrc), "per-stage ok/error captured");
ok(/ms: Date\.now\(\) - t0/.test(dailySrc), "per-stage timing captured");
const healthSrc = fs.readFileSync(path.join(REPO, "lib/automation/health.ts"), "utf-8");
ok(/catch \(e\)/.test(healthSrc) && /ok: error === null/.test(healthSrc), "recordRun writes a row even when the stage throws");

// -------------------------------------------------------------------------
console.log("=== 2. cron auth is still protected, and fails closed ===");
// -------------------------------------------------------------------------
for (const job of ["notice-scout", "notices", "scholarships", "scholarships-freshness", "deadline-assistant"]) {
  const src = fs.readFileSync(path.join(REPO, "app/api/cron", job, "route.ts"), "utf-8");
  ok(/CRON_SECRET/.test(src) && /isAuthorizedAdmin/.test(src), `${job}: bearer secret OR admin`);
  ok(/if \(secret && header === `Bearer \$\{secret\}`\) return true;/.test(src), `  ${job}: fails closed with no secret set`);
}
const assistantRoute = fs.readFileSync(path.join(REPO, "app/api/cron/deadline-assistant/route.ts"), "utf-8");
ok(!/searchParams/.test(assistantRoute), "the assistant route accepts no parameters a caller could steer it with");

// -------------------------------------------------------------------------
console.log("=== 16/26. an approved notice with an explicit deadline yields a proposal ===");
// -------------------------------------------------------------------------
const good = proposeFromCandidate({ notice: notice(), candidate: cand(), siblings: [cand()] });
ok(good.ok, "the proposal validates against the schema");
if (good.ok) {
  ok(good.value.classification === "deadline", `classification ${good.value.classification}`);
  ok(good.value.date === "2026-10-31", `date ${good.value.date}`);
  ok(good.value.program === "GKS-U", `program ${good.value.program}`);
  ok(good.value.cycle === 2026, `cycle ${good.value.cycle}`);
  ok(good.value.deadline_type === "application_deadline", `type ${good.value.deadline_type}`);
  ok(good.value.confidence >= AUTO_VERIFY_MIN_CONFIDENCE, `confidence ${good.value.confidence} reaches the gate threshold`);
  ok(!!good.value.evidence, "evidence quoted");

  const strict = evaluateGate(good.value, gateCtx());
  ok(strict.failed.length === 0, `the full gate passes on the merits ${JSON.stringify(strict.failed)}`);

  console.log("=== 25. auto-verify disabled -> suggestion only ===");
  delete process.env.AUTO_VERIFY_ENABLED;
  const off = evaluateGate(good.value, gateCtx());
  ok(off.decision === "needs_review", `flag off -> ${off.decision}`);
  ok(off.suppressedByFlag === true, "  and it is recorded as suppressed by the flag, not as a failure");

  for (const v of ["false", "TRUE", "1", "yes", ""]) {
    process.env.AUTO_VERIFY_ENABLED = v;
    ok(evaluateGate(good.value, gateCtx()).decision === "needs_review", `AUTO_VERIFY_ENABLED="${v}" does NOT enable writes`);
  }

  console.log("=== 26. strict auto gate success -> auto_verified ===");
  process.env.AUTO_VERIFY_ENABLED = "true";
  const on = evaluateGate(good.value, gateCtx());
  ok(on.decision === "auto_verified", `flag on + full gate -> ${on.decision}`);
  ok(on.suppressedByFlag === false, "  not suppressed");

  console.log("=== 17. an unapproved notice can NEVER auto verify ===");
  const unapproved = evaluateGate(good.value, gateCtx({ noticeApproved: false }));
  ok(unapproved.decision === "needs_review", `unapproved -> ${unapproved.decision}`);
  ok(unapproved.failed.some((f) => /not been approved/.test(f)), "  and the reason says so");
  const unofficial = evaluateGate(good.value, gateCtx({ officialSource: false }));
  ok(unofficial.decision === "needs_review", "a non-official source can never auto verify");
  delete process.env.AUTO_VERIFY_ENABLED;
}

// -------------------------------------------------------------------------
console.log("=== 18/19. low confidence and a missing year go to review ===");
// -------------------------------------------------------------------------
const vague = proposeFromCandidate({
  notice: notice(),
  candidate: cand({ kind: "unclassified", context: "The date 2026-10-31 appears here.", confidence: "low" }),
  siblings: [],
});
ok(vague.ok && vague.value.classification === "ambiguous", "an unlabelled date is ambiguous, not a deadline");
if (vague.ok) {
  ok(vague.value.date === null, "  and carries no date forward");
  ok(evaluateGate(vague.value, gateCtx()).decision === "needs_review", "  -> needs_review");
}
// A missing year never becomes a candidate at all (extractor), and a notice
// whose title states no year yields a null cycle, which the gate refuses.
const noCycle = proposeFromCandidate({
  notice: notice({ title: "Global Korea Scholarship Application Guidelines" }),
  candidate: cand(),
  siblings: [cand()],
});
ok(noCycle.ok && noCycle.value.cycle === null, "a title with no year -> cycle null, never guessed");
if (noCycle.ok) {
  const g = evaluateGate(noCycle.value, gateCtx());
  ok(g.decision === "needs_review", "  -> needs_review");
  ok(g.failed.some((f) => /cycle/.test(f)), "  because the cycle is not clear");
}
ok(extractCycle("2026 GKS-U and 2027 GKS-G combined notice") === null, "two years in a title -> no cycle chosen");
ok(extractCycle("2026 GKS-U Guidelines") === 2026, "one year -> that cycle");

// -------------------------------------------------------------------------
console.log("=== 20. multiple conflicting dates -> needs_review ===");
// -------------------------------------------------------------------------
const a = cand({ date: "2026-10-31" });
const b = cand({ date: "2026-11-15" });
const conflicted = proposeFromCandidate({ notice: notice(), candidate: a, siblings: [a, b] });
ok(conflicted.ok && conflicted.value.classification === "ambiguous", "two dates of the same kind -> ambiguous");
if (conflicted.ok) {
  ok(/different dates/.test(conflicted.value.reason), `  reason names the conflict: ${conflicted.value.reason}`);
  ok(evaluateGate(conflicted.value, gateCtx({ conflictingCandidateDates: ["2026-11-15"] })).decision === "needs_review", "  -> needs_review");
}

// -------------------------------------------------------------------------
console.log("=== 21. a result date is not an application deadline ===");
// -------------------------------------------------------------------------
const result = proposeFromCandidate({
  notice: notice(),
  candidate: cand({ kind: "result_announcement", context: "Results will be announced on 2026-12-20." }),
  siblings: [],
});
ok(result.ok && result.value.classification === "not_deadline", "a result date classifies as not_deadline");
if (result.ok) {
  ok(result.value.date === null, "  and carries no date");
  ok(evaluateGate(result.value, gateCtx()).decision === "rejected_not_deadline", "  -> rejected_not_deadline");
}
// NOTE: the candidate extractor has no "interview" kind -- an interview date
// comes through as "unclassified". That is still safe (ambiguous never
// auto-verifies), but it reaches review rather than being auto-rejected.
const interview = proposeFromCandidate({
  notice: notice(),
  candidate: cand({ kind: "unclassified", context: "Interviews are held on 2026-11-02.", confidence: "low" }),
  siblings: [],
});
ok(interview.ok && interview.value.classification === "ambiguous", "an interview date arrives unclassified -> ambiguous");
ok(interview.ok && interview.value.date === null, "  and never carries a date forward");
ok(interview.ok && evaluateGate(interview.value, gateCtx()).decision === "needs_review", "  -> needs_review, never auto-verified");

// -------------------------------------------------------------------------
console.log("=== 24. schema failure -> needs_review, never a silent write ===");
// -------------------------------------------------------------------------
const bad = [
  { label: "not an object", input: "oops" },
  { label: "missing classification", input: { confidence: 0.99, evidence: "x", reason: "y" } },
  { label: "impossible date", input: { classification: "deadline", date: "2026-02-31", confidence: 0.99, evidence: "x", reason: "y" } },
  { label: "confidence out of range", input: { classification: "deadline", confidence: 4, evidence: "x", reason: "y" } },
  { label: "empty evidence", input: { classification: "deadline", confidence: 0.99, evidence: "", reason: "y" } },
  { label: "unknown program", input: { classification: "deadline", program: "GKS-X", confidence: 0.99, evidence: "x", reason: "y" } },
  { label: "cycle as a string", input: { classification: "deadline", cycle: "2026", confidence: 0.99, evidence: "x", reason: "y" } },
];
for (const { label, input } of bad) {
  const r = parseProposal(input);
  ok(!r.ok, `rejected (${label})`);
}
ok(parseProposal({ classification: "deadline", confidence: 0.99, evidence: "x", reason: "y" }).ok, "a minimal valid proposal is accepted");

console.log("=== evidence is sanitised before it can reach a page ===");
ok(!sanitizeText("<script>alert(1)</script>").includes("<"), "angle brackets stripped from quoted evidence");
  ok(sanitizeText("a\u0000b\u001fc").indexOf("\u0000") === -1, "control characters stripped");
const parsedEvil = parseProposal({ classification: "deadline", confidence: 0.99, evidence: "<img src=x onerror=1>", reason: "r" });
ok(parsedEvil.ok && !parsedEvil.value.evidence.includes("<"), "sanitisation happens inside the parser, not at the call site");

// -------------------------------------------------------------------------
console.log("=== 15/11. deadline dedupe ===");
// -------------------------------------------------------------------------
const base = parseProposal({
  classification: "deadline", program: "GKS-U", track: "embassy", cycle: 2026,
  deadline_type: "application_deadline", scope_type: "global", country: null, university: null,
  date: "2026-10-31", timezone: null, confidence: 0.99, evidence: "e", reason: "r",
});
if (!base.ok) { ok(false, "base proposal should validate"); } else {
  const existing: ExistingDeadline[] = [{
    id: "d1", program: "GKS-U", cycle: 2026, track: "embassy", scope_type: "global",
    country: null, university: null, deadline_type: "application_deadline", date: "2026-10-31",
    sourceUrl: "https://www.studyinkorea.go.kr/en/x?nttId=900", sourceNoticeId: "900",
  }];
  ok(findDuplicate(base.value, "https://www.studyinkorea.go.kr/en/x?nttId=900", "900", existing)?.via === "source", "same source + date + type -> duplicate via source key");
  ok(findDuplicate(base.value, "https://other.example/x", null, existing)?.via === "scope", "different URL, same scope -> duplicate via scope key");

  console.log("  --- scopes are NEVER merged on a matching date ---");
  const countryScoped: ExistingDeadline[] = [{ ...existing[0], id: "d2", scope_type: "country", country: "Nepal" }];
  ok(findDuplicate(base.value, "https://other.example/x", null, countryScoped) === null, "a global deadline is not the same as a country one on the same date");
  const uniScoped: ExistingDeadline[] = [{ ...existing[0], id: "d3", scope_type: "university", university: "Korea University" }];
  ok(findDuplicate(base.value, "https://other.example/x", null, uniScoped) === null, "nor the same as a university-scoped one");
  ok(scopeKey({ ...base.value, date: base.value.date }) !== scopeKey({ ...base.value, scope_type: "country", country: "Nepal" }), "scope is part of the identity key");

  console.log("=== 22/23. extension vs conflict ===");
  const later = parseProposal({ ...base.value, date: "2026-11-30" });
  if (later.ok) {
    const ext = reconcile(later.value, "https://x", null, existing, "The application deadline has been extended to 30 November 2026.");
    ok(ext.kind === "extension", `explicit extension detected (${ext.kind})`);
    const conflict = reconcile(later.value, "https://x", null, existing, "The application deadline is 30 November 2026.");
    ok(conflict.kind === "conflict", `a different date with no extension wording -> conflict (${conflict.kind})`);
    if (conflict.kind === "conflict") {
      const g = evaluateGate(later.value, gateCtx({ existingVerifiedDate: "2026-10-31" }));
      ok(g.decision === "needs_review", "  a conflicting official date always goes to review");
    }
    process.env.AUTO_VERIFY_ENABLED = "true";
    const gExt = evaluateGate(later.value, gateCtx({ existingVerifiedDate: "2026-10-31" }));
    ok(gExt.decision === "needs_review", "even a detected extension never auto-supersedes a verified deadline");
    delete process.env.AUTO_VERIFY_ENABLED;
  }
  const fresh = reconcile(base.value, "https://x", null, [], "no prior");
  ok(fresh.kind === "new", "nothing existing -> new");
}

// -------------------------------------------------------------------------
console.log("=== scope extraction never invents a country ===");
// -------------------------------------------------------------------------
ok(extractScope("Applications are invited from all countries.").scope_type === "global", "no named audience -> global");
const uniScope = extractScope("This applies to Korea University applicants.");
ok(uniScope.scope_type === "university" && uniScope.university === "Korea University", `university named -> ${uniScope.university}`);
ok(uniScope.country === null, "  and no country is derived from the university name");

// -------------------------------------------------------------------------
console.log("=== 17/18. interview dates are typed, and never a deadline ===");
// -------------------------------------------------------------------------
const ivDates = extractCandidateDates("Interviews will be held on 2026-11-02.", "u");
ok(ivDates.length === 1 && ivDates[0].kind === "interview", `an interview date is typed 'interview' (${ivDates[0]?.kind})`);
const ivProposal = proposeFromCandidate({ notice: notice(), candidate: cand({ kind: "interview", context: "Interviews will be held on 2026-11-02.", date: "2026-11-02" }), siblings: [] });
ok(ivProposal.ok && ivProposal.value.deadline_type === "interview", `proposal carries deadline_type=interview (${ivProposal.ok ? ivProposal.value.deadline_type : "?"})`);
ok(ivProposal.ok && ivProposal.value.classification === "not_deadline", "  classified not_deadline -- it is a schedule fact, not something to meet");
ok(ivProposal.ok && ivProposal.value.date === null, "  and never carries an application date");
if (ivProposal.ok) {
  process.env.AUTO_VERIFY_ENABLED = "true";
  ok(evaluateGate(ivProposal.value, gateCtx()).decision === "rejected_not_deadline", "  even in strict-auto it is never an application deadline");
  delete process.env.AUTO_VERIFY_ENABLED;
}
ok(!isCountdownType("interview") && !isCountdownType("result"), "interview/result are not countdown types");
ok(isCountdownType("application_deadline") && isCountdownType("document_deadline"), "application/document deadlines are");
// The extractor must not now mistake a deadline for an interview.
const stillDeadline = extractCandidateDates("Applications must be received no later than 2026-10-31.", "u");
ok(stillDeadline[0]?.kind === "application_deadline", `a real deadline is unaffected (${stillDeadline[0]?.kind})`);

// -------------------------------------------------------------------------
console.log("=== 11-16. static + live merge ===");
// -------------------------------------------------------------------------
const liveRow = (over: Partial<LiveVerifiedDeadline> = {}): LiveVerifiedDeadline => ({
  id: "L1", program: "GKS-U", track: "embassy", cycle: "2026",
  deadlineType: "application_deadline", label: "GKS-U Embassy Track application deadline",
  deadline: "2026-10-31", timezone: null, scopeType: "global", country: null, university: null,
  sourceUrl: "https://www.studyinkorea.go.kr/en/x", sourceNoticeId: null,
  confidence: 0.99, verificationSource: "assistant", ...over,
});
const staticRec = deadlineNoticeDataset.deadlines.filter((d) => d.program === "GKS-U" && d.cycle === "2026");
ok(staticRec.length === 3, `curated GKS-U 2026 records: ${staticRec.length}`);

// The curated 2026 GKS-U records are all scope "post_selection", which maps
// to deadline_type "document_deadline" -- so that is the type a live row must
// carry to occupy the same slot as one of them.
ok(staticRec.every((r) => r.scope === "post_selection"), "the curated GKS-U 2026 records are all post_selection document dates");

// 11. identical to a curated record -> deduped
const identical = liveRow({ deadlineType: "document_deadline", deadline: staticRec[0].deadline, track: staticRec[0].track });
const m1 = mergeWithStatic([identical], staticRec);
ok(m1.live.length === 0 && m1.duplicates.length === 1, "11. a live row identical to a curated one is deduped away");

// 12. same slot, different date -> conflict, NOT silently overwritten
const conflicting2 = liveRow({ deadlineType: "document_deadline", deadline: "2027-01-15", track: staticRec[0].track });
const m2 = mergeWithStatic([conflicting2], staticRec);
ok(m2.live.length === 0, "12. a live row contradicting a curated date is NOT shown");
ok(m2.conflicts.length === 1, `  it is reported as a conflict instead (${m2.conflicts.length})`);
ok(
  m2.conflicts.length > 0 && m2.conflicts[0].staticDeadline !== m2.conflicts[0].liveDeadline,
  `  with both dates recorded (${m2.conflicts[0]?.staticDeadline} vs ${m2.conflicts[0]?.liveDeadline})`
);

// An application deadline occupies a DIFFERENT slot from those document
// dates, so it merges cleanly rather than being dropped as a false conflict.
const appDeadline = liveRow({ deadlineType: "application_deadline", deadline: "2026-10-31", track: "embassy" });
const m3 = mergeWithStatic([appDeadline], staticRec);
ok(m3.live.length === 1 && m3.conflicts.length === 0, "an application deadline does not collide with post_selection records");

// 13/14. live rows join upcoming / historical through the real matcher
const NOW = new Date("2026-08-29T00:00:00Z");
const future = liveRow({ id: "Lf", deadline: "2026-12-01", track: "embassy" });
const past = liveRow({ id: "Lp", deadline: "2026-01-05", track: "embassy" });
const feed = matchDeadlineNoticeFeed(deadlineNoticeDataset, { program: "GKS-U", track: "embassy", cycle: "2026", now: NOW, live: [future, past] });
ok(feed.upcoming.some((d) => d.id === "live:Lf"), "13. a future live deadline appears in upcoming");
ok(feed.historical.some((d) => d.id === "live:Lp"), "14. a past live deadline appears in historical");
ok(feed.upcoming.every((d) => d.daysUntil >= 0), "  upcoming never carries a negative countdown");
ok(feed.historical.length >= 3, "  curated historical records are still present");
const noLive = matchDeadlineNoticeFeed(deadlineNoticeDataset, { program: "GKS-U", track: "embassy", cycle: "2026", now: NOW });
ok(noLive.upcoming.length === 0 && noLive.historical.length === 3, "  with no live rows the behaviour is exactly what it was before");

// 15. track:null broad matching preserved
const broad = liveRow({ id: "Lb", track: null, deadline: "2026-12-02" });
const emb = matchDeadlineNoticeFeed(deadlineNoticeDataset, { program: "GKS-U", track: "embassy", cycle: "2026", now: NOW, live: [broad] });
const uni = matchDeadlineNoticeFeed(deadlineNoticeDataset, { program: "GKS-U", track: "university", cycle: "2026", now: NOW, live: [broad] });
ok(emb.upcoming.some((d) => d.id === "live:Lb"), "15. a track:null live deadline reaches Embassy");
ok(uni.upcoming.some((d) => d.id === "live:Lb"), "  and University");
const wrongProgram = matchDeadlineNoticeFeed(deadlineNoticeDataset, { program: "GKS-G", track: "embassy", cycle: "2026", now: NOW, live: [broad] });
ok(!wrongProgram.upcoming.some((d) => d.id === "live:Lb"), "  but never the other programme");
const wrongCycle = matchDeadlineNoticeFeed(deadlineNoticeDataset, { program: "GKS-U", track: "embassy", cycle: "2027", now: NOW, live: [broad] });
ok(!wrongCycle.upcoming.some((d) => d.id === "live:Lb"), "  and never another cycle");

// 16. country/university metadata stored but NOT overmatched
const countryScoped = liveRow({ id: "Lc", scopeType: "country", country: "Nepal", deadline: "2026-12-03" });
const uniScoped = liveRow({ id: "Lu", scopeType: "university", university: "Korea University", deadline: "2026-12-04" });
ok(!participatesInMatching(countryScoped), "16. a country-scoped deadline does not take part in matching");
ok(!participatesInMatching(uniScoped), "  nor a university-scoped one");
const scoped = matchDeadlineNoticeFeed(deadlineNoticeDataset, { program: "GKS-U", track: "embassy", cycle: "2026", now: NOW, live: [countryScoped, uniScoped] });
ok(!scoped.upcoming.some((d) => d.id.startsWith("live:L")), "  so a Nepal-specific date is never shown to every applicant");
ok(participatesInMatching(liveRow()), "  a global one does participate");
// Interview/result rows never reach the countdown even at global scope.
ok(!participatesInMatching(liveRow({ deadlineType: "interview" })), "  an interview row never reaches the countdown");

console.log("=== conflicts are reported for the admin, never auto-resolved ===");
// -------------------------------------------------------------------------
const clash = liveRow({ id: "Lx", deadlineType: "document_deadline", deadline: "2027-01-15", track: "embassy" });
const reported = findStaticLiveConflicts([clash], deadlineNoticeDataset.deadlines);
ok(reported.length === 1, `a disagreeing live row is reported once (${reported.length})`);
if (reported.length) {
  const r = reported[0];
  ok(r.program === "GKS-U" && r.cycle === "2026", `carries program/cycle (${r.program}/${r.cycle})`);
  ok(r.track === "embassy" && r.deadlineType === "document_deadline", `track and type (${r.track}/${r.deadlineType})`);
  ok(!!r.staticDate && !!r.liveDate && r.staticDate !== r.liveDate, `both dates (${r.staticDate} vs ${r.liveDate})`);
  ok(!!r.sourceUrl && !!r.reason, "source URL and reason present");
  ok(/curated date is what applicants see/.test(r.reason), "the reason states the curated date still wins");
}
// The applicant feed still withholds it -- reporting does not un-withhold.
const withheld = matchDeadlineNoticeFeed(deadlineNoticeDataset, { program: "GKS-U", track: "embassy", cycle: "2026", now: NOW, live: [clash] });
ok(!withheld.upcoming.some((d) => d.id === "live:Lx") && !withheld.historical.some((d) => d.id === "live:Lx"),
   "the conflicting live date is still not shown to applicants");
ok(findStaticLiveConflicts([liveRow()], deadlineNoticeDataset.deadlines).length === 0, "a non-conflicting live row reports nothing");
// Reporting is read-only: the finder takes no client and returns plain data.
const lsSrc = fs.readFileSync(path.join(REPO, "lib/deadlines/live-schema.ts"), "utf-8");
ok(!/supabase|getSupabaseAdmin|insert\(|update\(/.test(lsSrc), "the conflict reporter writes nothing -- it is a pure function");

// -------------------------------------------------------------------------
console.log("=== 32. the assistant tables are private ===");
// -------------------------------------------------------------------------
async function securityChecks() {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const table of ["deadline_proposals", "content_audit_log", "automation_runs"]) {
    const read = await anon.from(table).select("id").limit(1);
    ok((read.data?.length ?? 0) === 0, `anon SELECT on ${table} returns nothing`);
    const write = await anon.from(table).insert({ id: "00000000-0000-0000-0000-000000000000" });
    ok(write.error !== null, `  anon INSERT on ${table} is refused (${write.error?.code})`);
  }

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const table of ["deadline_proposals", "content_audit_log", "automation_runs"]) {
    const { error } = await admin.from(table).select("id").limit(1);
    ok(!error, `service role CAN read ${table}`);
  }

  console.log("=== 33/34/35. source health ===");
  const { getSourceHealth, getJobHealth, SOURCE_STALE_HOURS } = await import("@/lib/automation/health");
  const now = new Date();
  const sources = await getSourceHealth(now);
  ok(sources.length > 0, `${sources.length} sources evaluated`);
  const active = sources.filter((s) => s.active);
  ok(active.every((s) => typeof s.stale === "boolean"), "every active source gets a stale verdict");
  const staleOnes = active.filter((s) => s.stale);
  ok(
    staleOnes.every((s) => s.hoursSinceSuccess === null || s.hoursSinceSuccess > SOURCE_STALE_HOURS),
    `stale sources really are past the ${SOURCE_STALE_HOURS}h threshold (${staleOnes.length} stale)`
  );
  ok(sources.filter((s) => !s.active).every((s) => !s.stale), "an inactive source is never flagged stale -- nothing asks it to run");
  const fresh = active.filter((s) => !s.stale);
  ok(fresh.every((s) => (s.hoursSinceSuccess ?? 1e9) <= SOURCE_STALE_HOURS), "healthy sources are within the window");

  const jobs = await getJobHealth(now);
  ok(jobs.length === 4, `${jobs.length} scheduled jobs tracked`);
  ok(jobs.every((j) => typeof j.stale === "boolean"), "every job gets a verdict");
  ok(jobs.filter((j) => j.lastRunAt === null).every((j) => j.stale), "a job that has never run is flagged stale -- this is what 'the cron never fired' looks like");

  console.log("=== 4-10, 19-20. promotion to the applicant-facing deadline ===");
  const { promoteProposal, revokeForProposal, supersede } = await import("@/lib/assistant/promote");
  const { historyFor } = await import("@/lib/assistant/audit");
  const { getLiveVerifiedDeadlines } = await import("@/lib/deadlines/live");

  const { data: pn } = await admin.from("notices").select("id, source_url").limit(1).maybeSingle();
  if (!pn) { ok(false, "no notice available for the promotion fixture"); return; }

  const mkProposal = async (status: string, over: Record<string, unknown> = {}) => {
    const { data } = await admin.from("deadline_proposals").insert({
      notice_id: pn.id, candidate_date: "2026-10-31",
      candidate_kind: `__promo_${status}_${Math.random().toString(36).slice(2, 8)}__`,
      classification: "deadline", program: "GKS-U", track: "embassy", cycle: 2026,
      deadline_type: "application_deadline", scope_type: "global",
      proposed_date: "2026-10-31", confidence: 0.99,
      evidence: "e", reason: "r", source_url: pn.source_url, status, ...over,
    }).select("*").maybeSingle();
    return data;
  };
  const madeProposals: string[] = [];
  const madeDeadlines: string[] = [];

  try {
    // 8. needs_review must NOT promote
    const nr = await mkProposal("needs_review");
    madeProposals.push(nr!.id);
    const r1 = await promoteProposal(nr!.id, null);
    ok(!r1.ok, `8. a needs_review proposal does not promote (${r1.reason})`);

    // 7. rejected_not_deadline must NOT promote
    const rj = await mkProposal("rejected_not_deadline", { classification: "not_deadline", proposed_date: null });
    madeProposals.push(rj!.id);
    const r2 = await promoteProposal(rj!.id, null);
    ok(!r2.ok, `7. a rejected proposal does not promote (${r2.reason})`);

    // interview type must not promote even when verified
    const iv = await mkProposal("admin_verified", { deadline_type: "interview" });
    madeProposals.push(iv!.id);
    const r3 = await promoteProposal(iv!.id, null);
    ok(!r3.ok, `an interview-typed proposal never becomes a countdown deadline (${r3.reason})`);

    // 4. strict auto -> live verified deadline
    const auto = await mkProposal("auto_verified");
    madeProposals.push(auto!.id);
    const r4 = await promoteProposal(auto!.id, null);
    ok(r4.ok, `4. an auto_verified proposal promotes (${r4.reason ?? "ok"})`);
    if (r4.verifiedDeadlineId) madeDeadlines.push(r4.verifiedDeadlineId);
    const { data: vd } = await admin.from("verified_deadlines").select("*").eq("proposal_id", auto!.id).maybeSingle();
    ok(vd?.status === "active", "  it is active");
    ok(vd?.verification_source === "assistant", `  attributed to the assistant (${vd?.verification_source})`);
    ok(vd?.deadline === "2026-10-31", `  with the proposed date (${vd?.deadline})`);

    // 6. admin approval -> live verified deadline
    const adm = await mkProposal("admin_verified");
    madeProposals.push(adm!.id);
    const r5 = await promoteProposal(adm!.id, null);
    ok(r5.ok, "6. an admin_verified proposal promotes");
    if (r5.verifiedDeadlineId) madeDeadlines.push(r5.verifiedDeadlineId);
    const { data: vd2 } = await admin.from("verified_deadlines").select("verification_source").eq("proposal_id", adm!.id).maybeSingle();
    ok(vd2?.verification_source === "admin", `  attributed to the admin (${vd2?.verification_source})`);

    // 13. it reaches the applicant-facing loader
    const live = await getLiveVerifiedDeadlines();
    ok(live.some((l) => l.id === r4.verifiedDeadlineId), "the promoted deadline is returned by the applicant-facing loader");

    // 20. audit written for promotion
    const promoAudit = await historyFor("verified_deadline", r4.verifiedDeadlineId!);
    ok(promoAudit.length >= 1, `20. promotion wrote an audit entry (${promoAudit.length})`);

    // 9. revoking removes it from the applicant-facing feed
    const { revoked } = await revokeForProposal(auto!.id, null, "test revert");
    ok(revoked === 1, `9. revoking the verification withdrew ${revoked} deadline`);
    const liveAfter = await getLiveVerifiedDeadlines();
    ok(!liveAfter.some((l) => l.id === r4.verifiedDeadlineId), "  and it no longer reaches applicants");
    const { data: revokedRow } = await admin.from("verified_deadlines").select("status").eq("id", r4.verifiedDeadlineId!).maybeSingle();
    ok(revokedRow?.status === "revoked", "  the row is revoked, not deleted -- history preserved");
    ok((await historyFor("verified_deadline", r4.verifiedDeadlineId!)).some((h) => h.action === "reverted"), "20. revocation wrote an audit entry");

    // 10. superseded disappears from the active feed
    const supOk = await supersede(r5.verifiedDeadlineId!, r4.verifiedDeadlineId!, null, "test supersede");
    ok(supOk, "a deadline can be superseded");
    const liveAfter2 = await getLiveVerifiedDeadlines();
    ok(!liveAfter2.some((l) => l.id === r5.verifiedDeadlineId), "10. a superseded deadline disappears from the active feed");
    ok((await historyFor("verified_deadline", r5.verifiedDeadlineId!)).some((h) => h.action === "superseded"), "20. supersede wrote history");

    // 19. anon cannot mutate verified deadlines
    const anonVd = await anon.from("verified_deadlines").insert({
      program: "GKS-U", cycle: "2026", deadline_type: "application_deadline",
      label: "x", deadline: "2026-10-31", source_url: "u", verification_source: "admin",
    });
    ok(anonVd.error !== null, `19. anon INSERT on verified_deadlines refused (${anonVd.error?.code})`);
    const anonUpd = await anon.from("verified_deadlines").update({ deadline: "2030-01-01" }).neq("id", "00000000-0000-0000-0000-000000000000");
    const { data: unchanged } = await admin.from("verified_deadlines").select("deadline").eq("id", r4.verifiedDeadlineId!).maybeSingle();
    ok(unchanged?.deadline === "2026-10-31", `  anon UPDATE changed nothing (${unchanged?.deadline})${anonUpd.error ? " (refused)" : ""}`);
    const anonDel = await anon.from("verified_deadlines").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { count: stillThere } = await admin.from("verified_deadlines").select("id", { count: "exact", head: true });
    ok((stillThere ?? 0) >= 2, `  anon DELETE removed nothing (${stillThere} rows)${anonDel.error ? " (refused)" : ""}`);
    // The select policy only exposes active rows, so a revoked deadline is
    // invisible even to a direct anonymous read.
    const anonRead = await anon.from("verified_deadlines").select("id, status");
    ok((anonRead.data ?? []).every((r) => r.status === "active"), "anon can only ever see active verified deadlines");
  } finally {
    for (const id of madeDeadlines) await admin.from("content_audit_log").delete().eq("entity_id", id);
    await admin.from("verified_deadlines").delete().in("proposal_id", madeProposals);
    for (const id of madeProposals) await admin.from("content_audit_log").delete().eq("entity_id", id);
    await admin.from("deadline_proposals").delete().in("id", madeProposals);
  }

  console.log("=== 27-31. audit trail + rollback ===");
  const { writeAudit, revertProposal } = await import("@/lib/assistant/audit");

  // A throwaway proposal against a real notice, removed at the end.
  const { data: anyNotice } = await admin.from("notices").select("id, source_url").limit(1).maybeSingle();
  if (!anyNotice) {
    ok(false, "no notice available to attach an audit fixture to");
    return;
  }
  const { data: proposal, error: pErr } = await admin
    .from("deadline_proposals")
    .insert({
      notice_id: anyNotice.id,
      candidate_date: "2026-10-31",
      candidate_kind: "__audit_fixture__",
      classification: "deadline",
      program: "GKS-U", track: "embassy", cycle: 2026,
      deadline_type: "application_deadline", scope_type: "global",
      proposed_date: "2026-10-31",
      confidence: 0.99, evidence: "fixture evidence", reason: "fixture",
      source_url: anyNotice.source_url, status: "needs_review",
    })
    .select("*")
    .maybeSingle();

  if (pErr || !proposal) {
    ok(false, "could not create the audit fixture: " + (pErr?.message ?? "no row"));
    return;
  }

  try {
    ok(await writeAudit({
      entityType: "deadline_proposal", entityId: proposal.id, action: "assistant_proposed",
      actorType: "assistant", newValue: proposal, confidence: 0.99, evidence: "e", reason: "proposed",
    }), "27. an assistant proposal writes an audit event");

    // Simulate an admin verifying it, capturing the prior snapshot.
    const { data: verified } = await admin
      .from("deadline_proposals")
      .update({ status: "admin_verified", proposed_date: "2026-11-30" })
      .eq("id", proposal.id).select("*").maybeSingle();
    ok(await writeAudit({
      entityType: "deadline_proposal", entityId: proposal.id, action: "admin_verified",
      actorType: "admin", previousValue: proposal, newValue: verified, reason: "admin approved",
    }), "28. an admin approval writes an audit event");

    ok(await writeAudit({
      entityType: "deadline_proposal", entityId: proposal.id, action: "rejected_not_deadline",
      actorType: "admin", previousValue: verified, newValue: { status: "rejected_not_deadline" }, reason: "not a deadline",
    }), "29. a rejection writes an audit event");
    ok(await writeAudit({
      entityType: "deadline_proposal", entityId: proposal.id, action: "superseded",
      actorType: "admin", previousValue: verified, newValue: { status: "superseded" }, reason: "superseded",
    }), "30. a supersede writes history");

    const hist = await historyFor("deadline_proposal", proposal.id);
    ok(hist.length >= 4, `history holds every decision (${hist.length} entries)`);
    ok(hist[0].created_at >= hist[hist.length - 1].created_at, "newest first");

    console.log("=== 31. rollback restores the previous authoritative state ===");
    const before = await admin.from("deadline_proposals").select("proposed_date, status").eq("id", proposal.id).maybeSingle();
    ok(before.data?.proposed_date === "2026-11-30", `current date is the edited one (${before.data?.proposed_date})`);
    const rev = await revertProposal(proposal.id, proposal.decided_by ?? (await admin.auth.admin.listUsers({ page: 1, perPage: 1 })).data.users[0]?.id ?? proposal.id);
    ok(rev.ok, `revert succeeded ${rev.error ?? ""}`);
    // Revert undoes the MOST RECENT decision, restoring the snapshot captured
    // just before it -- not the very first state. The last decision here was
    // the supersede, whose previous_value was the admin-verified row, so that
    // is what comes back. Stepping further back is a second, separate action.
    const after = await admin.from("deadline_proposals").select("proposed_date, status").eq("id", proposal.id).maybeSingle();
    ok(after.data?.status === "admin_verified", `restored the state before the last decision (${after.data?.status})`);
    ok(after.data?.proposed_date === "2026-11-30", `with that snapshot's date (${after.data?.proposed_date})`);
    ok(after.data?.status !== "superseded", "and the superseded status is gone");

    const histAfter = await historyFor("deadline_proposal", proposal.id);
    ok(histAfter.length > hist.length, "the revert is itself appended, not a rewrite");
    ok(histAfter.some((h) => h.action === "reverted"), "  recorded as a 'reverted' action");
    ok(
      histAfter.filter((h) => h.action === "admin_verified").length === 1,
      "history is append-only -- the superseded entry was not deleted by the revert"
    );
  } finally {
    await admin.from("content_audit_log").delete().eq("entity_id", proposal.id);
    await admin.from("deadline_proposals").delete().eq("id", proposal.id);
  }

  const { count: leftover } = await admin
    .from("deadline_proposals").select("id", { count: "exact", head: true })
    .eq("candidate_kind", "__audit_fixture__");
  ok((leftover ?? 0) === 0, "no audit fixture left behind");

  console.log("");
  console.log(`  (live: ${staleOnes.length} stale source(s), ${jobs.filter((j) => j.stale).length} stale job(s))`);
}

securityChecks()
  .catch((e) => {
    console.log("  FAIL  security/health checks threw: " + (e as Error).message);
    fail++;
  })
  .finally(() => {
    console.log("");
    console.log(fail ? fail + " FAILURES" : "ALL AUTOMATION + ASSISTANT CHECKS PASSED");
    process.exit(fail ? 1 : 0);
  });
