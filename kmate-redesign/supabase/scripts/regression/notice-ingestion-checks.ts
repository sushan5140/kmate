/**
 * Official notice ingestion pipeline checks.
 *
 * Run with:  npx tsx --conditions react-server supabase/scripts/regression/notice-ingestion-checks.ts
 *
 * The properties under test are the safety ones. Classification accuracy
 * matters, but what matters far more is that nothing here can publish: no
 * candidate date becomes a verified deadline, no unofficial domain is
 * accepted, and the source-controlled dataset is untouched by any of it.
 *
 * The pure-logic checks always run. The two persistence checks (approve and
 * reject surviving a round-trip) need public.notice_review_queue to exist and
 * report themselves as BLOCKED rather than passing silently if it does not.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./_env";
import { classifyNotice, classifyProgram, classifyTrack, classifyNoticeType } from "@/lib/notices/classify";
import { extractCandidateDates } from "@/lib/notices/extract-dates";
import {
  normalizePending,
  isAlreadyQueued,
  buildQueueKeys,
  isOfficialUrl,
  extractSourceNoticeId,
  titleDateKey,
  NormalizeError,
  type DiscoveredNotice,
} from "@/lib/notices/review-queue";
import { matchDeadlineNoticeFeed, nextVerifiedDeadline } from "@/lib/deadlines/matcher";
import { deadlineNoticeDataset } from "@/lib/deadlines";

let fail = 0;
let blocked = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + m);
  if (!c) fail++;
};
const block = (m: string) => {
  console.log("  BLOCKED  " + m);
  blocked++;
};

const REPO = path.join(__dirname, "..", "..", "..");
const OFFICIAL = "www.studyinkorea.go.kr";
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const OPTS = { officialDomain: OFFICIAL, publisher: "Study in Korea — Announcements (NIIED)" };

const notice = (over: Partial<DiscoveredNotice> = {}): DiscoveredNotice => ({
  id: "11111111-1111-1111-1111-111111111111",
  source_id: "22222222-2222-2222-2222-222222222222",
  source_url: "https://www.studyinkorea.go.kr/en/community/noticeRead.do?nttId=900&bbsId=BBSMSTR_000000000005",
  title: "2026 Global Korea Scholarship Undergraduate Application Guidelines",
  published_date: "2026-08-01",
  clean_text: "Applications must be received no later than 2026-10-31.",
  ...over,
});

// -------------------------------------------------------------------------
console.log("=== 1. an unseen notice becomes pending_review ===");
// -------------------------------------------------------------------------
const fresh = normalizePending(notice(), OPTS);
ok(fresh.status === "pending_review", "a newly normalized notice is pending_review, never approved");
ok(fresh.source_notice_id === "900", "the board's own notice id is read off the URL: " + fresh.source_notice_id);
ok(fresh.title.startsWith("2026 Global Korea Scholarship"), "title is carried through verbatim");
ok(fresh.published_at === "2026-08-01", "publication date is carried through verbatim");
ok(fresh.source_publisher === OPTS.publisher, "the registered official publisher is recorded");
ok(!isAlreadyQueued(fresh, buildQueueKeys([])), "against an empty queue it is genuinely unseen");
ok(extractSourceNoticeId("https://www.studyinkorea.go.kr/en/community/noticeList.do") === null,
   "a URL carrying no nttId yields a null notice id rather than a fabricated one");
ok(extractSourceNoticeId("not a url") === null, "an unparseable URL yields null instead of throwing");

// -------------------------------------------------------------------------
console.log("=== 2/3. a known notice is skipped, by each dedupe layer independently ===");
// -------------------------------------------------------------------------
const queuedRow = {
  notice_id: fresh.notice_id,
  source_url: fresh.source_url,
  source_notice_id: fresh.source_notice_id,
  title: fresh.title,
  published_at: fresh.published_at,
};
ok(isAlreadyQueued(fresh, buildQueueKeys([queuedRow])), "the same notice re-scouted is skipped");

// Layer 1 alone: same notice_id, everything else different.
ok(
  isAlreadyQueued(fresh, buildQueueKeys([{ ...queuedRow, source_url: "https://www.studyinkorea.go.kr/en/x?nttId=1", source_notice_id: "1", title: "different", published_at: "2020-01-01" }])),
  "layer 1: a matching notice_id alone is enough to skip"
);
// Layer 2 alone: same URL, different everything else.
ok(
  isAlreadyQueued(fresh, buildQueueKeys([{ ...queuedRow, notice_id: "other", source_notice_id: null, title: "different", published_at: null }])),
  "layer 2: a matching canonical source_url alone is enough to skip"
);
// Layer 3 alone: same board id reached under a different URL.
ok(
  isAlreadyQueued(fresh, buildQueueKeys([{ notice_id: "other", source_url: "https://www.studyinkorea.go.kr/en/community/noticeRead.do?bbsId=OTHER&nttId=900", source_notice_id: "900", title: "different", published_at: null }])),
  "layer 3: the same official notice id under a URL variant is skipped"
);
// Layer 4 alone: re-post with no matching id or URL.
ok(
  isAlreadyQueued(fresh, buildQueueKeys([{ notice_id: "other", source_url: "https://www.studyinkorea.go.kr/en/community/noticeRead.do?nttId=555&bbsId=B", source_notice_id: "555", title: fresh.title, published_at: fresh.published_at }])),
  "layer 4 fallback: same title + publication date is skipped"
);
ok(
  !isAlreadyQueued(fresh, buildQueueKeys([{ notice_id: "other", source_url: "https://www.studyinkorea.go.kr/en/community/noticeRead.do?nttId=555&bbsId=B", source_notice_id: "555", title: fresh.title, published_at: "2019-01-01" }])),
  "but the same title on a DIFFERENT date is not treated as a duplicate"
);
ok(
  titleDateKey("  Two   Spaces  ", "2026-01-01") === titleDateKey("two spaces", "2026-01-01"),
  "the fallback key is whitespace- and case-insensitive"
);

// -------------------------------------------------------------------------
console.log("=== 4. a notice naming no program is stored as unknown ===");
// -------------------------------------------------------------------------
ok(classifyProgram("Notice on the operation of the dormitory") === "unknown", "no program named -> unknown");
ok(normalizePending(notice({ title: "General notice", clean_text: "No program named here." }), OPTS).program === "unknown",
   "and that unknown is what gets stored");
ok(classifyProgram("2026 GKS-U Application Guidelines") === "GKS-U", "GKS-U is recognised");
ok(classifyProgram("2026 GKS-G Graduate Program Results") === "GKS-G", "GKS-G is recognised");
ok(classifyProgram("Global Korea Scholarship graduate program call") === "GKS-G", "spelled-out graduate wording is recognised");
ok(
  classifyProgram("2026 GKS-U and GKS-G combined announcement") === "unknown",
  "a notice naming BOTH programs is unknown, not arbitrarily assigned to one"
);

// -------------------------------------------------------------------------
console.log("=== 5. a track that cannot be inferred is null ===");
// -------------------------------------------------------------------------
ok(classifyTrack("2026 GKS-U Application Guidelines") === null, "no track named -> null");
ok(classifyTrack("Embassy Track second round results") === "embassy", "embassy track is recognised");
ok(classifyTrack("University Track second round results") === "university", "university track is recognised");
ok(
  classifyTrack("Results for the Embassy Track and University Track") === null,
  "naming BOTH tracks yields null, not a guess"
);
ok(normalizePending(notice({ title: "General notice", clean_text: "" }), OPTS).track === null, "and null is what gets stored");

console.log("=== Korean-language notices classify too ===");
// The board publishes most notices in Korean; English-only patterns would
// classify a Korean GKS notice as unknown/null -- safe, but useless.
ok(classifyProgram("2027년도 한국정부초청 학부 장학생 선발 요강") === "GKS-U", "Korean undergraduate GKS title -> GKS-U");
ok(classifyProgram("2027년도 한국정부초청 대학원 장학생 선발 요강") === "GKS-G", "Korean graduate GKS title -> GKS-G");
ok(classifyProgram("2027년도 한국정부초청 석사과정 장학생 모집") === "GKS-G", "Korean master's wording -> GKS-G");
ok(classifyTrack("대사관 추천 전형 2차 합격자 발표") === "embassy", "Korean 대사관 추천 -> embassy");
ok(classifyTrack("대학 추천 전형 2차 합격자 발표") === "university", "Korean 대학 추천 -> university");
ok(classifyNoticeType("2027년도 한국정부초청 학부 장학생 선발 요강") === "guideline", "Korean 선발요강 -> guideline");
ok(classifyNoticeType("2차 합격자 발표 안내") === "result", "Korean 합격자 발표 -> result");
ok(classifyNoticeType("접수 기간 연장 안내") === "schedule_change", "Korean 기간 연장 -> schedule_change");
ok(classifyNoticeType("원서 접수 마감일 안내") === "deadline", "Korean 접수 마감 -> deadline");
ok(classifyNoticeType("게임음악 경연대회 안내") === "other", "an unrelated Korean notice stays 'other'");
ok(
  classifyProgram("2026년 을지연습 및 민방위훈련 안내") === "unknown",
  "a Korean notice that is not about GKS at all stays unknown"
);

const koCands = extractCandidateDates(
  [
    "원서 접수 마감: 2026년 10월 31일",
    "서류 제출 기한은 2026년 11월 15일입니다.",
    "합격자 발표: 2026년 12월 20일",
  ].join("\n"),
  "https://www.studyinkorea.go.kr/en/x"
);
const koByDate = new Map(koCands.map((c) => [c.date, c]));
ok(koCands.length === 3, "three Korean-format dates are extracted (" + koCands.length + ")");
ok(koByDate.get("2026-10-31")?.kind === "application_deadline", "Korean 접수 마감 date -> application_deadline");
ok(koByDate.get("2026-11-15")?.kind === "document_submission", "Korean 서류 제출 date -> document_submission");
ok(koByDate.get("2026-12-20")?.kind === "result_announcement", "Korean 합격자 발표 date -> result_announcement");

console.log("=== notice_type classification, specific before generic ===");
ok(classifyNoticeType("2026 GKS-U Application Guidelines") === "guideline", "guideline");
ok(classifyNoticeType("Announcement of the results of the 2nd round") === "result", "result");
ok(classifyNoticeType("Postponement of the interview schedule") === "schedule_change", "schedule_change");
ok(classifyNoticeType("Application deadline for the 2026 cycle") === "deadline", "deadline");
ok(classifyNoticeType("Notice on dormitory operations") === "other", "other is a real outcome, not a failure bucket");
ok(
  classifyNoticeType("Announcement of the results — application deadline was 2026-10-31") === "result",
  "a results notice that also says 'deadline' still classifies as a result"
);
ok(
  classifyNotice("2026 GKS-U Embassy Track Application Guidelines", "").program === "GKS-U" &&
    classifyNotice("2026 GKS-U Embassy Track Application Guidelines", "").track === "embassy" &&
    classifyNotice("2026 GKS-U Embassy Track Application Guidelines", "").notice_type === "guideline",
  "a fully-stated title classifies on all three axes"
);
ok(
  classifyNotice("2026 GKS-U Guidelines", "This also mentions the graduate program in passing.").program === "GKS-U",
  "the title wins over an incidental mention in the body"
);

// -------------------------------------------------------------------------
console.log("=== 6. dates are extracted as candidates only ===");
// -------------------------------------------------------------------------
const body = [
  "The application deadline is 2026-10-31.",
  "Required documents must be submitted by November 15, 2026.",
  "Results will be announced on 2026년 12월 20일.",
  "The final university choice is due 2 January 2027.",
  "An invitation letter will be issued on 2027-02-01.",
  "This sentence mentions 2026-03-03 with no cue at all.",
].join("\n");
const cands = extractCandidateDates(body, "https://www.studyinkorea.go.kr/en/x");

ok(cands.length >= 6, "every explicit date is captured (" + cands.length + ")");
ok(cands.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date)), "each is a well-formed ISO date");
ok(cands.every((c) => c.context.length > 0 && c.rawMatch.length > 0), "each keeps its raw match and nearby text");
ok(cands.every((c) => c.sourceUrl === "https://www.studyinkorea.go.kr/en/x"), "each carries the official source URL");
ok(cands.every((c) => ["high", "medium", "low"].includes(c.confidence)), "each carries an extraction confidence");

const byDate = new Map(cands.map((c) => [c.date, c]));
ok(byDate.get("2026-10-31")?.kind === "application_deadline", "the application deadline is identified");
ok(byDate.get("2026-11-15")?.kind === "document_submission", "document submission is identified");
ok(byDate.get("2026-12-20")?.kind === "result_announcement", "a Korean-format result date is identified");
ok(byDate.get("2027-01-02")?.kind === "final_university_choice", "final university choice is identified");
ok(byDate.get("2027-02-01")?.kind === "invitation_letter", "the invitation letter date is identified");
ok(byDate.get("2026-03-03")?.kind === "unclassified", "a date with no cue is kept as UNCLASSIFIED rather than guessed");
ok(byDate.get("2026-03-03")?.confidence === "low", "and is marked low confidence");

console.log("=== date parsing refuses to invent ===");
ok(extractCandidateDates("The deadline is October 31 (no year given).", "u").length === 0,
   "a date with no year is skipped -- the year is never supplied");
ok(extractCandidateDates("Invalid: 2026-02-31.", "u").length === 0, "an impossible calendar date is rejected");
ok(extractCandidateDates("", "u").length === 0, "empty text yields nothing");
ok(extractCandidateDates("No dates in this sentence whatsoever.", "u").length === 0, "text with no dates yields nothing");
const repeated = extractCandidateDates("Deadline 2026-10-31. Again deadline 2026-10-31. And again 2026-10-31.", "u");
ok(repeated.length === 1, "a date repeated with the same meaning is not duplicated for the reviewer (" + repeated.length + ")");

// -------------------------------------------------------------------------
console.log("=== 7. no candidate date can become a verified deadline ===");
// -------------------------------------------------------------------------
const beforeDeadlines = JSON.stringify(deadlineNoticeDataset.deadlines);
const beforeNotices = JSON.stringify(deadlineNoticeDataset.notices);
const loud = normalizePending(
  notice({ clean_text: "The application deadline is 2026-10-31 and results come 2026-12-20." }),
  OPTS
);
ok(loud.extracted_dates.length === 2, "the notice yields two candidate dates");
ok(JSON.stringify(deadlineNoticeDataset.deadlines) === beforeDeadlines, "the verified deadline list is unchanged by extraction");
ok(JSON.stringify(deadlineNoticeDataset.notices) === beforeNotices, "the verified notice list is unchanged by extraction");
ok(
  !deadlineNoticeDataset.deadlines.some((d) => d.deadline === "2026-10-31"),
  "the extracted date did NOT appear in the verified dataset"
);
// The structural guarantee: a candidate has no shape a DeadlineRecord could be
// read from. There is no status:'verified', no cycle, no source_id.
const candidateKeys = Object.keys(loud.extracted_dates[0]).sort().join(",");
ok(
  candidateKeys === "confidence,context,date,kind,rawMatch,sourceUrl",
  "a candidate carries no verified-deadline fields (no status/cycle/source_id): " + candidateKeys
);
ok(
  !JSON.stringify(loud.extracted_dates).includes('"verified"'),
  "the word 'verified' appears nowhere in a candidate"
);

// -------------------------------------------------------------------------
console.log("=== 10. the source-controlled verified dataset is never written ===");
// -------------------------------------------------------------------------
const DATASET_PATH = path.join(REPO, "data", "deadlines-notices-data.json");
const datasetBefore = fs.readFileSync(DATASET_PATH, "utf-8");
const pipelineFiles = [
  "lib/notices/review-queue.ts",
  "lib/notices/classify.ts",
  "lib/notices/extract-dates.ts",
  "lib/notices/scout.ts",
  "lib/notices/discovery.ts",
  "app/api/admin/notice-queue/[id]/moderate/route.ts",
  "app/api/cron/notice-scout/route.ts",
];
/** Comments are stripped first: prose ABOUT the dataset is fine, code touching it is not. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

for (const f of pipelineFiles) {
  const code = stripComments(fs.readFileSync(path.join(REPO, f), "utf-8"));
  ok(
    !/deadlines-notices-data/.test(code),
    `${f} has no code reference to the verified dataset file`
  );
  ok(
    !/\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream)\b/.test(code),
    `${f} contains no filesystem write of any kind`
  );
  ok(!/\bfrom "@\/lib\/deadlines/.test(code), `${f} does not import the verified deadline layer`);
}
ok(fs.readFileSync(DATASET_PATH, "utf-8") === datasetBefore, "the dataset file is byte-identical after the whole run");

// -------------------------------------------------------------------------
console.log("=== 11. no unofficial domain is accepted ===");
// -------------------------------------------------------------------------
const UNOFFICIAL = [
  "https://www.reddit.com/r/gks/comments/abc",
  "https://someblog.wordpress.com/gks-2026",
  "https://scholarshipsads.com/gks",
  "https://kr.emb-japan.go.jp/notice",
  "http://www.studyinkorea.go.kr/en/x",
  "https://www.studyinkorea.go.kr.evil.com/en/x",
  "https://evil.com/?x=www.studyinkorea.go.kr",
  "https://studyinkorea.go.kr/en/x",
  "not a url at all",
  "javascript:alert(1)",
];
for (const url of UNOFFICIAL) {
  ok(!isOfficialUrl(url, OFFICIAL), "rejected: " + url);
}
ok(isOfficialUrl("https://www.studyinkorea.go.kr/en/community/noticeRead.do?nttId=1", OFFICIAL), "the registered official host is accepted");
for (const url of UNOFFICIAL.slice(0, 4)) {
  let threw = false;
  try {
    normalizePending(notice({ source_url: url }), OPTS);
  } catch (e) {
    threw = e instanceof NormalizeError;
  }
  ok(threw, "normalizePending refuses to build a record from " + new URL(url).hostname);
}

// -------------------------------------------------------------------------
console.log("=== 12. a malformed notice does not crash the batch ===");
// -------------------------------------------------------------------------
const batch: DiscoveredNotice[] = [
  notice({ id: "a", source_url: "https://www.studyinkorea.go.kr/en/x?nttId=1" }),
  notice({ id: "b", title: "", source_url: "https://www.studyinkorea.go.kr/en/x?nttId=2" }),
  notice({ id: "c", title: null as unknown as string, source_url: "https://www.studyinkorea.go.kr/en/x?nttId=3" }),
  notice({ id: "d", source_url: "" }),
  notice({ id: "e", source_url: "https://reddit.com/r/gks" }),
  notice({ id: "f", clean_text: null, published_date: null, source_url: "https://www.studyinkorea.go.kr/en/x?nttId=6" }),
  notice({ id: "g", clean_text: " � <<<>>> &amp;#; ".repeat(200), source_url: "https://www.studyinkorea.go.kr/en/x?nttId=7" }),
];
const normalized: string[] = [];
const failures: string[] = [];
for (const n of batch) {
  try {
    normalized.push(normalizePending(n, OPTS).notice_id);
  } catch (e) {
    failures.push(`${n.id}: ${(e as Error).message}`);
  }
}
ok(normalized.length === 3, "the three well-formed notices normalize (" + normalized.join(",") + ")");
ok(failures.length === 4, "the four broken ones are reported as parse failures, not thrown out of the loop");
ok(normalized.includes("f"), "a notice with no body and no date still normalizes -- both are legitimate nulls");
ok(normalized.includes("g"), "a notice with garbage bytes still normalizes rather than crashing");
const noBody = normalizePending(batch[5], OPTS);
ok(noBody.published_at === null && noBody.extracted_dates.length === 0, "and yields a null date with no candidates");

// -------------------------------------------------------------------------
console.log("=== 13. no client-side arbitrary URL fetching ===");
// -------------------------------------------------------------------------
for (const f of ["lib/notices/study-in-korea.ts", "lib/notices/discovery.ts", "lib/notices/review-queue.ts", "lib/notices/scout.ts"]) {
  ok(fs.readFileSync(path.join(REPO, f), "utf-8").startsWith('import "server-only";'), `${f} is server-only`);
}
const clientComponent = fs.readFileSync(path.join(REPO, "components/admin/notice-review-queue.tsx"), "utf-8");
ok(clientComponent.includes('"use client"'), "the review UI is the only client component in the pipeline");
const clientFetches = [...clientComponent.matchAll(/fetch\(\s*[`"']([^`"']*)/g)].map((m) => m[1]);
ok(clientFetches.length > 0, "it does fetch (" + clientFetches.length + " call site)");
ok(
  clientFetches.every((u) => u.startsWith("/api/admin/notice-queue/")),
  "and every call target is a fixed same-origin admin path: " + JSON.stringify(clientFetches)
);
ok(!/https?:\/\//.test(clientFetches.join("")), "no absolute URL is fetched from the client");
const scoutRoute = fs.readFileSync(path.join(REPO, "app/api/cron/notice-scout/route.ts"), "utf-8");
ok(
  !/searchParams|req(uest)?\.url|body\.url|\burl\b\s*[:=]\s*(await|request)/.test(scoutRoute),
  "the scout route accepts no URL parameter of any kind"
);
ok(scoutRoute.includes("isAuthorizedAdmin") && scoutRoute.includes("CRON_SECRET"), "and is gated by admin session or cron secret");
const moderateRoute = fs.readFileSync(path.join(REPO, "app/api/admin/notice-queue/[id]/moderate/route.ts"), "utf-8");
ok(moderateRoute.includes("isAuthorizedAdmin"), "the moderation route is admin-gated");
ok(!/fetch\(/.test(moderateRoute), "and performs no outbound fetch");

// -------------------------------------------------------------------------
console.log("=== 14. the existing deadline matcher is unchanged ===");
// -------------------------------------------------------------------------
const NOW = new Date("2026-08-27T00:00:00Z");
const feed = matchDeadlineNoticeFeed(deadlineNoticeDataset, { program: "GKS-U", track: "embassy", cycle: "2026", now: NOW });
ok(feed.upcoming.length === 0 && feed.historical.length === 3, "GKS-U embassy 2026: 0 upcoming, 3 historical, exactly as before");
ok(nextVerifiedDeadline(deadlineNoticeDataset, { program: "GKS-U", track: "embassy", cycle: "2026", now: NOW }) === null,
   "still no next verified deadline");
const f2027 = matchDeadlineNoticeFeed(deadlineNoticeDataset, { program: "GKS-U", track: "embassy", cycle: "2027", now: NOW });
ok(f2027.upcoming.length === 0 && f2027.historical.length === 0 && f2027.notices.length === 0,
   "2027 still returns nothing -- ingestion added no fallback path");
ok(deadlineNoticeDataset.generated_for_cycle === "2026", "dataset cycle still 2026");
ok(deadlineNoticeDataset.policy.never_infer_future_cycle_dates === true, "the never-infer policy flag is intact");
ok(deadlineNoticeDataset.deadlines.length === 3 && deadlineNoticeDataset.notices.length === 8,
   "record counts unchanged: " + deadlineNoticeDataset.deadlines.length + " deadlines, " + deadlineNoticeDataset.notices.length + " notices");

// -------------------------------------------------------------------------
console.log("=== 15. the Requirement Checker dataset is untouched ===");
// -------------------------------------------------------------------------
const rc = JSON.parse(fs.readFileSync(path.join(REPO, "data", "requirement-checker-data.json"), "utf-8"));
ok(rc.records.length === 184, "still 184 records (" + rc.records.length + ")");
ok(rc.record_count === 184, "and the declared record_count still agrees");

// -------------------------------------------------------------------------
console.log("=== 8/9. approve and reject persist ===");
// -------------------------------------------------------------------------
async function persistenceChecks() {
  const env = loadEnvLocal();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const probe = await admin.from("notice_review_queue").select("id").limit(1);
  if (probe.error) {
    block("public.notice_review_queue does not exist in this environment -- apply the schema change first");
    block("  (approve persistence and reject persistence both need it)");
    return;
  }

  const { data: source } = await admin
    .from("sources")
    .select("id")
    .eq("source_type", "study_in_korea")
    .eq("active", true)
    .maybeSingle();
  if (!source) {
    block("no active study_in_korea source registered");
    return;
  }

  // A throwaway NOTICE of its own, rather than borrowing a real one: notice_id
  // is UNIQUE, so once the scout has queued every real notice there is none
  // left to attach a test row to. Creating and removing its own fixture keeps
  // this check independent of how full the queue happens to be.
  const marker = `__regression__${Date.now()}`;
  const { data: anyNotice, error: noticeErr } = await admin
    .from("notices")
    .insert({
      source_id: source.id,
      title: marker,
      source_url: `https://www.studyinkorea.go.kr/en/community/noticeRead.do?nttId=${marker}`,
      published_date: null,
      status: "new",
      is_active: false,
    })
    .select("id, source_id, source_url, title, published_date")
    .maybeSingle();

  if (noticeErr || !anyNotice) {
    block("could not create a throwaway notice: " + (noticeErr?.message ?? "no row returned"));
    return;
  }
  const { data: row, error: insertErr } = await admin
    .from("notice_review_queue")
    .insert({
      notice_id: anyNotice.id,
      source_id: anyNotice.source_id,
      source_url: `https://www.studyinkorea.go.kr/en/community/noticeRead.do?nttId=${marker}`,
      source_notice_id: marker,
      title: marker,
      published_at: null,
      source_publisher: "regression",
      program: "unknown",
      track: null,
      notice_type: "other",
      extracted_dates: [{ date: "2026-10-31", kind: "application_deadline", context: "x", rawMatch: "2026-10-31", sourceUrl: "u", confidence: "high" }],
      status: "pending_review",
    })
    .select("id, status")
    .maybeSingle();

  if (insertErr || !row) {
    // notice_id is UNIQUE; a real queue row for this notice may already exist.
    block("could not insert a throwaway queue row: " + (insertErr?.message ?? "no row returned"));
    return;
  }

  try {
    ok(row.status === "pending_review", "a queued row starts as pending_review");

    for (const [status, label] of [["approved", "approve"], ["rejected", "reject"]] as const) {
      await admin
        .from("notice_review_queue")
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq("id", row.id);
      const { data: after } = await admin
        .from("notice_review_queue")
        .select("status, reviewed_at, extracted_dates")
        .eq("id", row.id)
        .maybeSingle();
      ok(after?.status === status, `${label} persists across a re-read (${after?.status})`);
      ok(after?.reviewed_at !== null, `  and stamps reviewed_at`);
      ok(Array.isArray(after?.extracted_dates) && after.extracted_dates.length === 1,
         `  and leaves the candidate dates untouched as candidates`);
    }

    // Reversal back to pending.
    await admin.from("notice_review_queue").update({ status: "pending_review", reviewed_at: null }).eq("id", row.id);
    const { data: reverted } = await admin.from("notice_review_queue").select("status").eq("id", row.id).maybeSingle();
    ok(reverted?.status === "pending_review", "a decision can be reversed back to pending_review");

    // The status column is constrained -- no arbitrary value can be stored.
    const { error: badStatus } = await admin.from("notice_review_queue").update({ status: "published" }).eq("id", row.id);
    ok(badStatus !== null, "the DB refuses a status outside pending_review/approved/rejected");
  } finally {
    await admin.from("notice_review_queue").delete().eq("id", row.id);
    // Cascades would remove the queue row anyway; both are removed explicitly
    // so a failure part-way through still leaves no fixture behind.
    await admin.from("notices").delete().eq("id", anyNotice.id);
  }

  // Approving changed nothing in the source-controlled dataset.
  ok(fs.readFileSync(DATASET_PATH, "utf-8") === datasetBefore, "after approve/reject, the verified dataset is still byte-identical");

  // ---------------------------------------------------------------------
  console.log("=== the queue is unreachable from a browser client ===");
  // ---------------------------------------------------------------------
  // RLS is enabled with NO policy, so an RLS-respecting client (every browser
  // session) can neither read nor write it. Reviewer decisions are only ever
  // reachable through the service-role client behind requireAdmin.
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const anonRead = await anon.from("notice_review_queue").select("id, title").limit(5);
  ok((anonRead.data?.length ?? 0) === 0, "anon SELECT returns no rows");

  const anonInsert = await anon.from("notice_review_queue").insert({
    notice_id: anyNotice.id,
    source_id: anyNotice.source_id,
    source_url: "https://www.studyinkorea.go.kr/en/anon-probe",
    title: "anon probe",
    source_publisher: "anon probe",
  });
  ok(anonInsert.error !== null, "anon INSERT is refused (" + anonInsert.error?.code + ")");

  // An anon UPDATE reports no error because RLS filters every row out before
  // the update sees it -- so it matches zero rows and succeeds vacuously.
  // What matters is that nothing actually changed, which is asserted here
  // rather than inferred from the absent error.
  const beforeStatuses = await admin
    .from("notice_review_queue")
    .select("id, status, reviewed_at")
    .order("id");
  await anon.from("notice_review_queue").update({ status: "approved" }).neq("id", ZERO_UUID);
  const afterStatuses = await admin
    .from("notice_review_queue")
    .select("id, status, reviewed_at")
    .order("id");
  ok(
    JSON.stringify(beforeStatuses.data) === JSON.stringify(afterStatuses.data),
    "anon UPDATE changed no row (" + (afterStatuses.data?.length ?? 0) + " rows byte-identical)"
  );

  const anonDelete = await anon.from("notice_review_queue").delete().neq("id", ZERO_UUID);
  const afterDelete = await admin.from("notice_review_queue").select("id", { count: "exact", head: true });
  ok(
    (afterDelete.count ?? 0) === (afterStatuses.data?.length ?? 0),
    "anon DELETE removed no row" + (anonDelete.error ? " (refused outright)" : "")
  );
}

persistenceChecks()
  .catch((e) => {
    console.log("  FAIL  persistence checks threw: " + (e as Error).message);
    fail++;
  })
  .finally(() => {
    console.log("");
    if (blocked) console.log(blocked + " check(s) BLOCKED on the schema change");
    console.log(fail ? fail + " FAILURES" : "ALL NOTICE INGESTION CHECKS PASSED");
    process.exit(fail ? 1 : 0);
  });
