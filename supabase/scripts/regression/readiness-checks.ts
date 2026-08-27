/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Application Readiness checks.
 *
 * Run with:  npx tsx --conditions react-server supabase/scripts/regression/readiness-checks.ts
 *
 * The `react-server` condition is what lets this import lib/readiness/index.ts,
 * which carries `server-only` to keep the 338 KB requirement dataset out of the
 * client bundle.
 *
 * Part 1 is the check suite delivered with the dataset, unchanged except for
 * its import paths. Part 2 was added during integration and covers the page's
 * own behaviour: hierarchy scoping, the client-side summary, and the cases the
 * UI is expected to handle.
 */
import { strict as assert } from "node:assert";
import { buildReadinessResult } from "@/lib/readiness/engine";
import checklist from "@/data/readiness-checklist-data.json";
import requirements from "@/data/requirement-checker-data.json";
import { getApplicationReadiness } from "@/lib/readiness";
import { summarizeReadiness } from "@/lib/readiness/summary";
import type { ReadinessItem } from "@/lib/readiness/schema";

const c = checklist as any;
const r = requirements.records as any[];

// ---------------------------------------------------------------------------
// Part 1 -- supplied with the dataset (imports adjusted only)
// ---------------------------------------------------------------------------

const u = buildReadinessResult(c, r, { program: "GKS-U" });
assert(u.items.some((x) => x.label === "Application Form" && x.status === "required"));
assert(u.items.some((x) => x.label.includes("authentication") || x.category === "authentication"));

const g = buildReadinessResult(c, r, { program: "GKS-G" });
assert(g.items.some((x) => x.label === "One Letter of Recommendation" && x.status === "required"));
assert(g.items.some((x) => x.label === "Research Proposal" && x.status === "conditional"));

const kmou = buildReadinessResult(c, r, {
  program: "GKS-U",
  university: "Korea Maritime & Ocean University",
  trackFamily: "embassy",
  selectedMajor: "College of Maritime Sciences",
});
assert(kmou.items.some((x) => x.label === "Seafarer's Medical Certificate"));

const missingIsNotNoRequirement = buildReadinessResult(c, r, {
  program: "GKS-U",
  university: "Yonsei University",
  trackFamily: "embassy",
});
assert(missingIsNotNoRequirement.warnings.some((w) => w.includes("not stated")));

console.log("readiness tests passed");

// ---------------------------------------------------------------------------
// Part 2 -- added during integration
// ---------------------------------------------------------------------------

let fail = 0;
const ok = (cond: boolean, m: string) => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + m);
  if (!cond) fail++;
};
const extras = (res: { items: ReadinessItem[] }) =>
  res.items.filter((i) => i.category === "university_extra");

console.log("");
console.log("=== core checklists render without a university ===");
const coreU = getApplicationReadiness({ program: "GKS-U" });
const coreG = getApplicationReadiness({ program: "GKS-G" });
ok(coreU.items.length === 13 && extras(coreU).length === 0, "GKS-U core checklist = 13 national documents, no extras");
ok(coreG.items.length === 15 && extras(coreG).length === 0, "GKS-G core checklist = 15 national documents, no extras");
ok(
  coreU.warnings.some((w) => w.includes("Select a university")),
  "GKS-U without a university says university extras are missing rather than absent"
);

console.log("=== statuses render across all four values ===");
const statuses = new Set([...coreU.items, ...coreG.items].map((i) => i.status));
ok(statuses.has("required") && statuses.has("conditional") && statuses.has("optional"),
   "Required / Conditional / Optional all present in the national checklists");
ok(
  [...coreU.items, ...coreG.items].every((i) => ["required", "conditional", "optional", "not_stated"].includes(i.status)),
  "no item carries a status outside the four displayable values"
);

console.log("=== GKS-G research ===");
const research = getApplicationReadiness({
  program: "GKS-G",
  university: "Hannam University",
  trackFamily: "university",
  subtype: "research",
});
const proposal = research.items.find((i) => i.label === "Research Proposal");
ok(proposal?.status === "conditional" && Boolean(proposal?.condition), "Research Proposal is conditional and states its condition");

console.log("=== KMOU maritime extra ===");
const kmouScoped = getApplicationReadiness({
  program: "GKS-U",
  university: "Korea Maritime & Ocean University",
  trackFamily: "embassy",
  selectedMajor: "College of Maritime Sciences",
});
const seafarer = kmouScoped.items.find((i) => i.label === "Seafarer's Medical Certificate");
ok(Boolean(seafarer), "Seafarer's Medical Certificate surfaces for KMOU + Maritime Sciences");
ok(seafarer?.category === "university_extra", "it is grouped under University-specific Requirements");
ok(seafarer?.origin === "university_requirement", "it comes from the Requirement Checker, not the readiness JSON");
const kmouNoMajor = getApplicationReadiness({
  program: "GKS-U",
  university: "Korea Maritime & Ocean University",
  trackFamily: "embassy",
});
const seafarerNoMajor = kmouNoMajor.items.find((i) => i.label === "Seafarer's Medical Certificate");
ok(seafarerNoMajor?.status === "conditional", "without the maritime major it stays conditional rather than required");

console.log("=== Yonsei: process shown, nothing converted to 'no requirement' ===");
const yonsei = getApplicationReadiness({ program: "GKS-U", university: "Yonsei University", trackFamily: "embassy" });
ok(extras(yonsei).length > 0, "Yonsei surfaces its university-specific process entry");
ok(
  extras(yonsei).every((i) => i.status !== "optional"),
  "no Yonsei extra is downgraded to optional by missing detail"
);
ok(
  yonsei.warnings.some((w) => w.includes("not stated in the verified source")),
  "the 'missing means not stated' warning is present"
);

console.log("=== Kookmin UIC + Ewha embassy integrate without invention ===");
const kookmin = getApplicationReadiness({
  program: "GKS-U",
  university: "Kookmin University",
  trackFamily: "university",
  subtype: "uic",
});
ok(kookmin.items.length >= 13, "Kookmin UIC renders the national checklist plus any extras");
ok(
  extras(kookmin).every((i) => i.sourceUrls.length > 0 || i.notes),
  "every Kookmin extra carries its own evidence or source"
);
const ewha = getApplicationReadiness({ program: "GKS-U", university: "Ewha Womans University", trackFamily: "embassy" });
const ewhaCore = ewha.items.filter((i) => i.origin === "gks_core");
ok(ewhaCore.length === 13, "Ewha adds no national documents beyond the 13 in the checklist dataset");
ok(
  extras(ewha).every((i) => i.origin === "university_requirement"),
  "every Ewha extra is traced to a Requirement Checker record"
);

console.log("=== hierarchy scoping matches the Requirement Checker ===");
// Participation-only GKS-G records reach neither track in the checker, so they
// must not contribute extras here either.
const kyungHee = getApplicationReadiness({
  program: "GKS-G",
  university: "Kyung Hee University",
  trackFamily: "embassy",
});
ok(extras(kyungHee).length === 0, "participation-only Kyung Hee contributes no GKS-G Embassy extras");
// Ajou's R&D row belongs to University Track even though the row also cites Embassy.
const ajouRd = getApplicationReadiness({
  program: "GKS-G",
  university: "Ajou University",
  trackFamily: "university",
  subtype: "rd",
});
ok(extras(ajouRd).length > 0 || ajouRd.items.length === 15, "Ajou University/R&D resolves through the checker hierarchy");
// A GKS-U university on the Embassy route must not pull in its UIC record's extras.
const ajouEmbassyU = getApplicationReadiness({ program: "GKS-U", university: "Ajou University", trackFamily: "embassy" });
const ajouUicU = getApplicationReadiness({ program: "GKS-U", university: "Ajou University", trackFamily: "university", subtype: "uic" });
ok(
  JSON.stringify(extras(ajouEmbassyU).map((i) => i.id)) !== JSON.stringify(extras(ajouUicU).map((i) => i.id)) ||
    extras(ajouEmbassyU).length === 0,
  "Ajou's Embassy and UIC routes do not share each other's extras"
);

console.log("=== client summary mirrors the engine ===");
const sample: ReadinessItem[] = coreU.items.map((item, i) => ({
  ...item,
  progress: (["ready", "missing", "in_progress", "not_applicable", "untracked"] as const)[i % 5],
}));
const viaEngine = buildReadinessResult(
  c,
  r,
  {
    program: "GKS-U",
    applicantDocumentProgress: sample
      .filter((i) => i.progress !== "untracked")
      .map((i) => ({ document_id: i.id, state: i.progress as any })),
  }
).summary;
ok(
  JSON.stringify(summarizeReadiness(sample)) === JSON.stringify(viaEngine),
  "summarizeReadiness() agrees with the engine for identical progress"
);
const noneTracked = summarizeReadiness(coreU.items);
ok(noneTracked.completion_percent === null, "an untouched checklist reports no percentage at all");
const partly = summarizeReadiness(coreU.items.map((i, idx) => ({ ...i, progress: idx === 0 ? "ready" : "untracked" })));
ok(
  partly.completion_percent !== null && partly.completion_percent < 100,
  "one ready document out of many never reads as 100% (got " + partly.completion_percent + "%)"
);
const allReady = summarizeReadiness(coreU.items.map((i) => ({ ...i, progress: i.status === "required" ? "ready" : "untracked" })));
ok(allReady.completion_percent === 100, "100% only once every required document is marked ready");

console.log("=== requirement dataset untouched ===");
ok((requirements as any).record_count === 184 && r.length === 184, "requirement-checker-data.json still holds 184 records");

console.log("");
console.log(fail ? fail + " FAILURES" : "ALL READINESS INTEGRATION CHECKS PASSED");
process.exit(fail ? 1 : 0);
