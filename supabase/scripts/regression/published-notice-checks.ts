/**
 * Approved-notice publishing checks.
 *
 * Run with:  npx tsx --conditions react-server supabase/scripts/regression/published-notice-checks.ts
 *
 * The property under test above all others: a notice reaches an applicant ONLY
 * because a human approved it AND a human classified its programme. Pending,
 * rejected, and approved-but-unknown rows must all be invisible in the GKS
 * feed -- and approving a notice must never turn a date inside it into a
 * verified deadline.
 *
 * The DB-backed section creates its own fixtures (pending / rejected /
 * approved / unknown), asserts against the real query, and removes them. It
 * leaves the live queue exactly as it found it.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./_env";
import {
  noticeAppliesTo,
  filterPublishedNotices,
  sortNewestFirst,
  dedupeAgainstStatic,
  canonicalUrl,
  titleDateIdentity,
  type PublishedGksNotice,
} from "@/lib/notices/published-schema";
import { deadlineNoticeDataset } from "@/lib/deadlines";

// getSupabaseAdmin() reads process.env directly, so the local values are
// seeded before the server-only module is imported below.
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
const DATASET_PATH = path.join(REPO, "data", "deadlines-notices-data.json");
const datasetBefore = fs.readFileSync(DATASET_PATH, "utf-8");

const pub = (over: Partial<PublishedGksNotice> = {}): PublishedGksNotice => ({
  id: "n1",
  title: "2026 GKS-U Embassy Track Application Guidelines",
  sourceUrl: "https://www.studyinkorea.go.kr/en/community/noticeRead.do?nttId=900&bbsId=B",
  sourceNoticeId: "900",
  publishedAt: "2026-08-01",
  language: "en",
  program: "GKS-U",
  track: "embassy",
  noticeType: "guideline",
  publisher: "Study in Korea — Announcements (NIIED)",
  reviewed: true,
  ...over,
});

// -------------------------------------------------------------------------
console.log("=== 3/4/5. programme and track matching ===");
// -------------------------------------------------------------------------
const uEmbassy = pub();
const gUniversity = pub({ id: "n2", program: "GKS-G", track: "university" });
const programWide = pub({ id: "n3", track: null });

ok(noticeAppliesTo(uEmbassy, "GKS-U", "embassy"), "approved GKS-U Embassy notice matches GKS-U Embassy");
ok(!noticeAppliesTo(uEmbassy, "GKS-U", "university"), "  and NOT GKS-U University");
ok(!noticeAppliesTo(uEmbassy, "GKS-G", "embassy"), "  and NOT GKS-G Embassy -- no cross-program leakage");
ok(noticeAppliesTo(gUniversity, "GKS-G", "university"), "approved GKS-G University notice matches its own program/track");
ok(!noticeAppliesTo(gUniversity, "GKS-U", "university"), "  and NOT GKS-U University");
ok(!noticeAppliesTo(gUniversity, "GKS-G", "embassy"), "  and NOT GKS-G Embassy");

ok(noticeAppliesTo(programWide, "GKS-U", "embassy"), "track:null notice is visible to Embassy");
ok(noticeAppliesTo(programWide, "GKS-U", "university"), "track:null notice is visible to University");
ok(noticeAppliesTo(programWide, "GKS-U", null), "track:null notice is visible when no track is chosen");
ok(!noticeAppliesTo(programWide, "GKS-G", "embassy"), "but a track:null GKS-U notice never reaches GKS-G");

// -------------------------------------------------------------------------
console.log("=== 8/9/10. /notices filters ===");
// -------------------------------------------------------------------------
const all = [
  uEmbassy,
  gUniversity,
  programWide,
  pub({ id: "n4", program: "GKS-G", track: "embassy", noticeType: "result" }),
  pub({ id: "n5", program: "GKS-U", track: "university", noticeType: "schedule_change" }),
  pub({ id: "n6", program: "GKS-U", track: null, noticeType: "deadline" }),
];
const ids = (l: PublishedGksNotice[]) => l.map((x) => x.id).sort().join(",");

ok(ids(filterPublishedNotices(all, { program: "all" })) === "n1,n2,n3,n4,n5,n6", "program=all returns everything");
ok(ids(filterPublishedNotices(all, { program: "GKS-U" })) === "n1,n3,n5,n6", "program=GKS-U returns only GKS-U");
ok(ids(filterPublishedNotices(all, { program: "GKS-G" })) === "n2,n4", "program=GKS-G returns only GKS-G");

const embassyFiltered = filterPublishedNotices(all, { track: "embassy" });
ok(ids(embassyFiltered) === "n1,n3,n4,n6", "track=embassy keeps embassy notices AND every track:null one");
const uniFiltered = filterPublishedNotices(all, { track: "university" });
ok(ids(uniFiltered) === "n2,n3,n5,n6", "track=university keeps university notices AND every track:null one");
ok(
  embassyFiltered.some((n) => n.track === null) && uniFiltered.some((n) => n.track === null),
  "a track:null notice is genuinely reachable under BOTH track selections"
);

// n2 overrides only program/track, so it keeps the default "guideline" type.
ok(ids(filterPublishedNotices(all, { noticeType: "guideline" })) === "n1,n2,n3", "type=guideline");
ok(ids(filterPublishedNotices(all, { noticeType: "result" })) === "n4", "type=result");
ok(ids(filterPublishedNotices(all, { noticeType: "schedule_change" })) === "n5", "type=schedule_change");
ok(ids(filterPublishedNotices(all, { noticeType: "deadline" })) === "n6", "type=deadline");
ok(filterPublishedNotices(all, { noticeType: "other" }).length === 0, "type=other correctly matches none of these");
ok(
  ids(filterPublishedNotices(all, { program: "GKS-U", track: "embassy", noticeType: "guideline" })) === "n1,n3",
  "the three filters combine"
);

console.log("=== sorting ===");
const sorted = sortNewestFirst([
  pub({ id: "old", publishedAt: "2026-01-01" }),
  pub({ id: "new", publishedAt: "2026-09-01" }),
  pub({ id: "none", publishedAt: null }),
]);
ok(sorted[0].id === "new", "newest first");
ok(sorted[2].id === "none", "a notice with no stated date sorts last rather than being dropped");

// -------------------------------------------------------------------------
console.log("=== 14/15. static-vs-live dedupe, static wins ===");
// -------------------------------------------------------------------------
const staticNotice = {
  sourceUrl: "https://www.studyinkorea.go.kr/en/community/noticeRead.do?nttId=900&bbsId=B",
  title: "2026 GKS-U Embassy Track Application Guidelines",
  publishedAt: "2026-08-01",
};

ok(dedupeAgainstStatic([uEmbassy], [staticNotice]).length === 0, "same source URL -> live copy dropped, static kept");
ok(
  dedupeAgainstStatic([uEmbassy], [{ ...staticNotice, sourceUrl: "https://www.studyinkorea.go.kr/en/community/noticeRead.do?bbsId=B&nttId=900" }]).length === 0,
  "the same URL with its query parameters reordered still collides"
);
ok(
  dedupeAgainstStatic([uEmbassy], [{ ...staticNotice, sourceUrl: "https://www.studyinkorea.go.kr/en/other?nttId=1", sourceNoticeId: "900" }]).length === 0,
  "different URL but same board notice id -> still one notice"
);
ok(
  dedupeAgainstStatic([uEmbassy], [{ sourceUrl: "https://www.studyinkorea.go.kr/en/x?nttId=77", title: "  2026 GKS-U EMBASSY track application   guidelines ", publishedAt: "2026-08-01" }]).length === 0,
  "fallback: normalized title + publication date collides regardless of case/spacing"
);
ok(
  dedupeAgainstStatic([uEmbassy], [{ ...staticNotice, publishedAt: "2019-01-01" }]).length === 0,
  "a differing publication date still collides when the source URL matches"
);
ok(
  dedupeAgainstStatic(
    [uEmbassy],
    [{ sourceUrl: "https://www.studyinkorea.go.kr/en/x?nttId=77", sourceNoticeId: "77", title: uEmbassy.title, publishedAt: "2019-01-01" }]
  ).length === 1,
  "but a different URL, different board id AND different date is a different notice -- it survives"
);
ok(
  dedupeAgainstStatic([uEmbassy], [{ sourceUrl: "https://www.studyinkorea.go.kr/en/x?nttId=77", sourceNoticeId: "77", title: "A completely different notice", publishedAt: "2026-08-01" }]).length === 1,
  "an unrelated static notice does not suppress a live one"
);
ok(dedupeAgainstStatic([uEmbassy], []).length === 1, "with no static records the live notice survives");

// 15. Conflicting classification: same official notice, different program.
const conflicting = pub({ program: "GKS-G", track: "university", noticeType: "result" });
const afterConflict = dedupeAgainstStatic([conflicting], [staticNotice]);
ok(afterConflict.length === 0, "a live notice that DISAGREES with the static record is dropped, not merged");
ok(
  !JSON.stringify(afterConflict).includes("GKS-G"),
  "  so no conflicting duplicate can reach the feed"
);

console.log("=== canonicalisation is not over-eager ===");
ok(canonicalUrl("https://www.studyinkorea.go.kr/a/") === canonicalUrl("https://WWW.StudyInKorea.GO.KR/A"), "host+path case and trailing slash folded");
ok(canonicalUrl("https://www.studyinkorea.go.kr/a?x=1") !== canonicalUrl("https://www.studyinkorea.go.kr/a?x=2"), "different query VALUES stay different");
ok(canonicalUrl("not a url") === "not a url", "an unparseable URL degrades to its own text rather than throwing");
ok(titleDateIdentity("A  B", null) === titleDateIdentity("a b", null), "title identity folds case and whitespace, null date included");

// -------------------------------------------------------------------------
console.log("=== 16. approving a notice never verifies a deadline ===");
// -------------------------------------------------------------------------
const publishedKeys = Object.keys(pub()).sort().join(",");
ok(
  publishedKeys === "id,language,noticeType,program,publishedAt,publisher,reviewed,sourceNoticeId,sourceUrl,title,track",
  "a published notice exposes no candidate dates: " + publishedKeys
);
for (const forbidden of ["extracted_dates", "extractedDates", "candidate", "daysUntil", "deadline:"]) {
  ok(!JSON.stringify(pub()).includes(forbidden), `  and no "${forbidden}" field`);
}
ok(!("reviewed_by" in pub()) && !("reviewed_at" in pub()), "no reviewer identity or timestamp is exposed");
ok(!("status" in pub()) && !("review_note" in pub()), "no queue status or moderation note is exposed");

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
for (const f of ["lib/notices/published.ts", "lib/notices/published-schema.ts", "app/notices/page.tsx", "components/notices/gks-notice-card.tsx"]) {
  const code = stripComments(fs.readFileSync(path.join(REPO, f), "utf-8"));
  ok(!/extracted_dates/.test(code), `${f} never reads extracted_dates`);
  ok(!/deadlines-notices-data/.test(code), `${f} has no code reference to the verified dataset file`);
  ok(!/\b(writeFile|writeFileSync|appendFile)\b/.test(code), `${f} performs no filesystem write`);
}
ok(fs.readFileSync(DATASET_PATH, "utf-8") === datasetBefore, "the verified dataset file is byte-identical");

console.log("=== the Home feed dedupes against the WHOLE curated dataset ===");
// Not just the notices matched for the current applicant: otherwise a live row
// that disagreed about the program could still surface under the OTHER
// program, where the static record it contradicts is not on screen to
// suppress it.
const feedSrc = fs.readFileSync(path.join(REPO, "components/home/deadline-notice-feed.tsx"), "utf-8");
ok(
  /dedupeAgainstStatic\(\s*liveMatched,\s*deadlineNoticeDataset\.notices/.test(feedSrc),
  "dedupe input is deadlineNoticeDataset.notices, not the matched subset"
);
ok(!/dedupeAgainstStatic\(\s*liveMatched,\s*staticMatched/.test(feedSrc), "  and never the matched subset alone");
ok(/\.sort\(\(a, b\) => b\.publishedAt\.localeCompare\(a\.publishedAt\)\)/.test(feedSrc), "the merged feed is ordered newest-first");
ok(/\.slice\(0, 3\)/.test(feedSrc), "and capped at 3 notices");

console.log("=== 17. the card links out safely ===");
const card = fs.readFileSync(path.join(REPO, "components/notices/gks-notice-card.tsx"), "utf-8");
ok(/target="_blank"/.test(card) && /rel="noopener noreferrer"/.test(card), "source links are target=_blank rel=noopener noreferrer");
ok(!/verified deadline/i.test(card.replace(/\/\*[\s\S]*?\*\//g, "")), "the card never calls an approved notice a verified deadline");
ok(/Official · Reviewed|Reviewed/.test(card), "it shows an Official/Reviewed badge instead");

// -------------------------------------------------------------------------
console.log("=== the deadline matcher is untouched ===");
// -------------------------------------------------------------------------
const NOW = new Date("2026-08-27T00:00:00Z");
const feed = deadlineNoticeDataset;
ok(feed.deadlines.length === 3 && feed.notices.length === 8, "static dataset still 3 deadlines / 8 notices");
ok(feed.generated_for_cycle === "2026", "cycle still 2026");
ok(feed.policy.never_infer_future_cycle_dates === true, "never-infer policy intact");
void NOW;

// -------------------------------------------------------------------------
console.log("=== 1/2/6/7. live query against real fixtures ===");
// -------------------------------------------------------------------------
async function dbChecks() {
  const { getApprovedGksNotices } = await import("@/lib/notices/published");
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: source } = await admin
    .from("sources")
    .select("id")
    .eq("source_type", "study_in_korea")
    .eq("active", true)
    .maybeSingle();
  if (!source) {
    ok(false, "no active study_in_korea source registered");
    return;
  }

  const baseline = await getApprovedGksNotices();
  const marker = `__pubtest__${Date.now()}`;
  const made: { noticeId: string; queueId: string }[] = [];

  // Four fixtures covering every publishing decision.
  const fixtures = [
    { key: "pending", status: "pending_review", program: "GKS-U", track: "embassy" },
    { key: "rejected", status: "rejected", program: "GKS-U", track: "embassy" },
    { key: "approved", status: "approved", program: "GKS-U", track: "embassy" },
    { key: "unknown", status: "approved", program: "unknown", track: null },
  ] as const;

  try {
    for (const f of fixtures) {
      const { data: n } = await admin
        .from("notices")
        .insert({
          source_id: source.id,
          title: `${marker}-${f.key}`,
          source_url: `https://www.studyinkorea.go.kr/en/community/noticeRead.do?nttId=${marker}-${f.key}`,
          published_date: "2026-08-20",
          status: "new",
          is_active: true,
          language: "en",
        })
        .select("id")
        .maybeSingle();
      if (!n) {
        ok(false, `could not create fixture notice ${f.key}`);
        return;
      }
      const { data: q } = await admin
        .from("notice_review_queue")
        .insert({
          notice_id: n.id,
          source_id: source.id,
          source_url: `https://www.studyinkorea.go.kr/en/community/noticeRead.do?nttId=${marker}-${f.key}`,
          source_notice_id: `${marker}-${f.key}`,
          title: `${marker}-${f.key}`,
          published_at: "2026-08-20",
          source_publisher: "fixture",
          program: f.program,
          track: f.track,
          notice_type: "guideline",
          // A candidate date deliberately present on the APPROVED fixture, to
          // prove approval does not promote it anywhere.
          extracted_dates: [
            { date: "2026-10-31", kind: "application_deadline", context: "x", rawMatch: "2026-10-31", sourceUrl: "u", confidence: "high" },
          ],
          status: f.status,
        })
        .select("id")
        .maybeSingle();
      if (!q) {
        ok(false, `could not queue fixture ${f.key}`);
        return;
      }
      made.push({ noticeId: n.id, queueId: q.id });
    }

    const published = await getApprovedGksNotices();
    const titles = published.map((p) => p.title);

    ok(!titles.includes(`${marker}-pending`), "1. a PENDING notice is hidden from the GKS feed");
    ok(!titles.includes(`${marker}-rejected`), "2. a REJECTED notice is hidden from the GKS feed");
    ok(titles.includes(`${marker}-approved`), "3. an APPROVED GKS-U Embassy notice IS published");
    ok(!titles.includes(`${marker}-unknown`), "6. an APPROVED but program=unknown notice is EXCLUDED");

    const approvedRow = published.find((p) => p.title === `${marker}-approved`)!;
    ok(approvedRow.program === "GKS-U" && approvedRow.track === "embassy", "  it carries its approved classification");
    ok(approvedRow.reviewed === true, "  and is flagged reviewed");
    ok(approvedRow.publishedAt === "2026-08-20", "  with the official publication date");
    ok(!JSON.stringify(approvedRow).includes("2026-10-31"), "16. its candidate date does NOT travel to the applicant");
    ok(!JSON.stringify(approvedRow).includes("extracted"), "  no extracted-date field of any kind is exposed");
    ok(published.length === baseline.length + 1, `only the one approved fixture was added (${baseline.length} -> ${published.length})`);

    // 7. The broad board keeps every ordinary notice, including the unknown one.
    const { data: board } = await admin
      .from("notices")
      .select("title")
      .in("status", ["new", "current"])
      .eq("is_active", true);
    const boardTitles = (board ?? []).map((b) => b.title);
    ok(boardTitles.includes(`${marker}-unknown`), "7. the unknown notice remains on All Official Notices");
    ok(boardTitles.includes(`${marker}-pending`), "  as does the pending one -- the board is not gated on review");
    // The board shows 'new' + 'current' only. Phase-1 freshness aging moves
    // anything published more than 30 days ago to 'archived', so the count
    // here is the non-archived subset -- not every indexed notice. That
    // behaviour predates this feature and must not change.
    const { count: indexed } = await admin.from("notices").select("id", { count: "exact", head: true });
    const { count: archived } = await admin
      .from("notices")
      .select("id", { count: "exact", head: true })
      .eq("status", "archived");
    const ordinaryOnBoard = boardTitles.filter((t) => !t.startsWith(marker)).length;
    ok(
      ordinaryOnBoard === (indexed ?? 0) - (archived ?? 0) - fixtures.length,
      `  the board carries every non-archived ordinary notice (${ordinaryOnBoard} of ${indexed} indexed, ${archived} aged out)`
    );
    ok(ordinaryOnBoard > 0, "  and it is not empty");
    const { data: archivedRows } = await admin
      .from("notices")
      .select("title")
      .eq("status", "archived")
      .limit(1);
    ok(
      archivedRows === null || !boardTitles.includes(archivedRows[0]?.title),
      "  an archived notice is still excluded from the board -- aging behaviour unchanged"
    );

    // 11/12. Personalization matching against real published rows.
    const forUEmbassy = published.filter((p) => noticeAppliesTo(p, "GKS-U", "embassy"));
    const forGUniversity = published.filter((p) => noticeAppliesTo(p, "GKS-G", "university"));
    ok(forUEmbassy.some((p) => p.title === `${marker}-approved`), "11. a saved GKS-U Embassy application sees it");
    ok(!forGUniversity.some((p) => p.title === `${marker}-approved`), "12. a saved GKS-G University application does NOT -- no leakage");

    // 13. No saved application -> nothing is personalized, feed simply unused.
    ok(published.every((p) => p.program === "GKS-U" || p.program === "GKS-G"), "13. every published row has a real program, so an unpersonalized view is still honest");
  } finally {
    for (const m of made) {
      await admin.from("notice_review_queue").delete().eq("id", m.queueId);
      await admin.from("notices").delete().eq("id", m.noticeId);
    }
  }

  // The queue is exactly as it was before this run.
  const after = await getApprovedGksNotices();
  ok(after.length === baseline.length, `fixtures removed; approved feed back to ${baseline.length}`);
  const { count: leftover } = await admin
    .from("notice_review_queue")
    .select("id", { count: "exact", head: true })
    .like("title", "\\_\\_pubtest\\_\\_%");
  ok((leftover ?? 0) === 0, "no fixture rows left in the review queue");
  const { count: leftoverNotices } = await admin
    .from("notices")
    .select("id", { count: "exact", head: true })
    .like("title", "\\_\\_pubtest\\_\\_%");
  ok((leftoverNotices ?? 0) === 0, "no fixture rows left in public.notices");

  console.log("");
  console.log(`  (current real approved GKS notices: ${after.length})`);
}

dbChecks()
  .catch((e) => {
    console.log("  FAIL  live checks threw: " + (e as Error).message);
    fail++;
  })
  .finally(() => {
    console.log("");
    console.log(fail ? fail + " FAILURES" : "ALL PUBLISHED NOTICE CHECKS PASSED");
    process.exit(fail ? 1 : 0);
  });
