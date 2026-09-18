import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const failures = [];
const ok = (condition, message) => {
  if (!condition) failures.push(message);
};

const readiness = readJson("data/readiness-checklist-data.json");
ok(readiness.program_cycles?.["GKS-U"] === "2027", "Readiness GKS-U cycle must be 2027");
ok(
  readiness.official_sources?.some(
    (s) => s.id === "gks_u_niied_2027" && String(s.url).includes("nttId=4522")
  ),
  "Readiness must point GKS-U at the current 2027 Study in Korea notice"
);
const uDocs = readiness.programs?.["GKS-U"]?.documents ?? [];
for (const id of [
  "u_application_form",
  "u_personal_statement",
  "u_study_plan",
  "u_recommendation",
  "u_applicant_agreement",
  "u_medical_assessment",
  "u_personal_info_consent",
  "u_citizenship_family",
  "u_graduation_certificate",
  "u_transcript",
]) {
  ok(uDocs.some((d) => d.id === id), `Readiness is missing current GKS-U document rule: ${id}`);
}

const requirements = readJson("data/requirement-checker-data.json");
ok(requirements.program_cycles?.["GKS-U"] === "2027", "Requirement Checker GKS-U cycle must be 2027");
const uRecords = requirements.records.filter((r) => r.program === "GKS-U");
ok(uRecords.length > 0, "Requirement Checker must contain GKS-U records");
for (const record of uRecords) {
  ok(
    record.verification?.national_cycle === "2027",
    `${record.id}: GKS-U national_cycle must be 2027`
  );
  ok(
    ["current", "mixed_cycle", "needs_reverification"].includes(record.verification?.freshness),
    `${record.id}: GKS-U requirement record needs explicit freshness`
  );
  if (record.verification?.detail_cycle !== "2027") {
    ok(
      record.verification?.freshness !== "current",
      `${record.id}: older university detail cannot be marked current`
    );
  }
}

const policy = read("lib/gks/gks-u-2027-policy.ts");
ok(policy.includes('cycle: "2027"'), "Canonical GKS-U policy cycle must be 2027");
ok(policy.includes("nttId=4522") || read("lib/gks/guidelines-2027.ts").includes("nttId=4522"), "Canonical 2027 source missing");

const universities = readJson("data/gks-universities.json");
ok(universities.program_cycles?.["GKS-U"] === "2027", "University seed GKS-U cycle must be 2027");
const gksUUniversities = universities.tracks?.["GKS-U"];
ok(gksUUniversities?.embassy_track?.type_a?.length === 28, "2027 GKS-U Type A list must contain 28 universities");
ok(gksUUniversities?.embassy_track?.type_b_rgks?.length === 42, "2027 GKS-U Type B list must contain 42 universities");
ok(gksUUniversities?.university_track_uic_bachelors?.length === 10, "2027 UIC bachelor list must contain 10 institutions");
ok(gksUUniversities?.university_track_uic_associate?.length === 3, "2027 UIC associate list must contain 3 institutions");
ok(gksUUniversities?.university_track_associate_degree?.length === 9, "2027 separate associate-degree list must contain 9 institutions");
ok(
  !gksUUniversities?.embassy_track?.type_a?.includes("Dankook University"),
  "A 2026-only GKS-U Type A university leaked into the 2027 seed"
);
ok(
  gksUUniversities?.embassy_track?.type_b_rgks?.includes("Hanbat National University"),
  "A current 2027 Type B university is missing from the seed"
);

const validator = read("lib/validation/university-eligibility.ts");
ok(!validator.includes("BONUS_PICKS"), "University validator must not add non-official bonus picks");
ok(
  validator.includes('gks_u_university: 1'),
  "GKS-U University Track must enforce the official one-university limit"
);

const officialGuidelines = read("lib/official-guidelines.ts");
ok(
  officialGuidelines.includes('assetType: "notice"') &&
    officialGuidelines.includes('versionLabel: "Current — 0914 revision"'),
  "Current 2027 guideline must point to the official 0914 notice rather than a stale mirror"
);
ok(
  !officialGuidelines.includes("https://kecindia.org/api/download/291"),
  "Stale pre-0914 direct PDF mirror must not be presented as the current guideline"
);

const askRoute = read("app/api/gks/ask/route.ts");
ok(!askRoute.includes("syncCommunityAnswers"), "GKS ask route must not sync community RAG answers");
ok(askRoute.includes("community: []"), "GKS answer response must keep community evidence empty");
ok(askRoute.includes("countRecentGksAsks"), "GKS AI must use persistent usage counting");

const nav = read("lib/nav-items.ts");
for (const group of ["overview", "application", "resources", "preparation", "community"]) {
  ok(nav.includes(`${group}:`), `Navigation group missing: ${group}`);
}

const universitySearch = read("lib/cached-content.ts");
ok(
  universitySearch.includes("CURRENT_GKS_U_UNIVERSITY_NAMES") &&
    universitySearch.includes('track === "gks_u"'),
  "GKS-U university search must fail closed against the current-cycle catalog"
);

const dailyMaintenance = read("lib/automation/daily.ts");
ok(
  dailyMaintenance.includes('{ name: "university-catalog"') &&
    dailyMaintenance.indexOf('"university-catalog"') < dailyMaintenance.indexOf('"notice-scout"'),
  "Daily maintenance must reconcile the university catalog before applicant-facing automation"
);

const universitySync = read("lib/gks/university-sync.ts");
ok(
  universitySync.includes("staleGksURowsRemoved") &&
    universitySync.includes('.eq("track", "gks_u")') &&
    universitySync.includes(".delete()"),
  "University sync must reconcile stale GKS-U eligibility instead of only upserting"
);

const oldReadinessSourceLeak = JSON.stringify(readiness.programs?.["GKS-U"] ?? {}).includes("official 2026 GKS-U");
ok(!oldReadinessSourceLeak, "Current GKS-U readiness rules still contain a 2026 application-form instruction");

if (failures.length) {
  console.error("\nKMate 2027 integrity checks failed:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log(
  `KMate 2027 integrity checks passed: ${uRecords.length} GKS-U requirement records are cycle-tagged, ${uDocs.length} readiness rules are current-cycle scoped, and the 2027 university/official-guideline guards are active.`
);
