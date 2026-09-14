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

const askRoute = read("app/api/gks/ask/route.ts");
ok(!askRoute.includes("syncCommunityAnswers"), "GKS ask route must not sync community RAG answers");
ok(askRoute.includes("community: []"), "GKS answer response must keep community evidence empty");
ok(askRoute.includes("countRecentGksAsks"), "GKS AI must use persistent usage counting");

const nav = read("lib/nav-items.ts");
for (const group of ["overview", "application", "resources", "preparation", "community"]) {
  ok(nav.includes(`${group}:`), `Navigation group missing: ${group}`);
}

const oldReadinessSourceLeak = JSON.stringify(readiness.programs?.["GKS-U"] ?? {}).includes("official 2026 GKS-U");
ok(!oldReadinessSourceLeak, "Current GKS-U readiness rules still contain a 2026 application-form instruction");

if (failures.length) {
  console.error("\nKMate 2027 integrity checks failed:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log(
  `KMate 2027 integrity checks passed: ${uRecords.length} GKS-U requirement records are cycle-tagged and ${uDocs.length} readiness rules are current-cycle scoped.`
);
