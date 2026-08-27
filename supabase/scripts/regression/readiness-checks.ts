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
import { getApplicationReadiness, getApplicationWorkspace } from "@/lib/readiness";
import { universitySlotsFor, storageKeyFor } from "@/lib/readiness/application";
import { createNameResolver, UNIVERSITY_NAME_ALIASES } from "@/lib/readiness/university-names";
import gksUniversities from "@/data/gks-universities.json";
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

// ---------------------------------------------------------------------------
// Part 3 -- the multi-university workspace
// ---------------------------------------------------------------------------

function MULTI_UNIVERSITY_CHECKS() {
  console.log("");
  console.log("=== university slots come from the quotas KMate already encodes ===");
  ok(universitySlotsFor("GKS-U", "embassy", "general") === 3, "GKS-U Embassy / General allows 3 universities");
  ok(universitySlotsFor("GKS-U", "embassy", "r_gks") === 2, "GKS-U Embassy / R-GKS allows 2 (the smaller official quota)");
  ok(universitySlotsFor("GKS-G", "university", "rd") === 3, "GKS-G allows 3");
  ok(universitySlotsFor("GKS-U", "university", "uic") === 4, "GKS-U University Track carries no embassy quota, so the platform cap applies");

  console.log("=== common documents appear once, whatever the university count ===");
  const three = getApplicationWorkspace({
    program: "GKS-U",
    track: "embassy",
    subtype: "general",
    universities: [
      { name: "Korea University", major: "International Relations" },
      { name: "Yonsei University", major: "Computer Science" },
      { name: "Chonnam National University", major: "Computer Science" },
    ],
  });
  ok(three.common.length === 13, "13 common GKS-U documents (got " + three.common.length + ")");
  ok(three.common.every((i) => i.category !== "university_extra"), "no university extra leaks into the common list");
  ok(new Set(three.common.map((i) => i.id)).size === three.common.length, "no common document is duplicated");
  ok(three.universities.length === 3, "three university sections");
  ok(
    three.universities.every((s) => s.items.every((i) => i.category === "university_extra")),
    "university sections carry only university extras -- the national checklist is not repeated"
  );

  const sectionFor = (w: { universities: { university: string; items: ReadinessItem[] }[] }, name: string) =>
    w.universities.find((s) => s.university === name)!;

  console.log("=== each university shows only its own requirements ===");
  const kmouWorkspace = getApplicationWorkspace({
    program: "GKS-U",
    track: "embassy",
    subtype: "general",
    universities: [
      { name: "Korea Maritime & Ocean University", major: "College of Maritime Sciences" },
      { name: "Ewha Womans University", major: "Computer Science" },
      { name: "Yonsei University", major: "Computer Science" },
    ],
  });
  const kmouSection = sectionFor(kmouWorkspace, "Korea Maritime & Ocean University");
  ok(
    kmouSection.items.some((i) => i.label === "Seafarer's Medical Certificate"),
    "KMOU + Maritime Sciences surfaces the Seafarer's Medical Certificate"
  );
  ok(
    kmouWorkspace.universities
      .filter((s) => s.university !== "Korea Maritime & Ocean University")
      .every((s) => !s.items.some((i) => i.label === "Seafarer's Medical Certificate")),
    "it appears under KMOU only, never under Ewha or Yonsei"
  );
  for (const s of kmouWorkspace.universities) {
    ok(
      s.items.every((i) => i.id.includes(s.university)),
      s.university + ": every item id is scoped to that university"
    );
  }

  console.log("=== Kookmin UIC stays isolated on its own route ===");
  const uic = getApplicationWorkspace({
    program: "GKS-U",
    track: "university",
    subtype: "uic",
    universities: [
      { name: "Kookmin University", major: "" },
      { name: "Ajou University", major: "" },
    ],
  });
  ok(uic.common.length === 13, "UIC route still renders the 13 common documents once");
  ok(
    sectionFor(uic, "Kookmin University").items.every((i) => i.id.includes("Kookmin")),
    "Kookmin UIC rules stay under Kookmin"
  );
  ok(
    sectionFor(uic, "Ajou University").items.every((i) => !i.id.includes("Kookmin")),
    "Ajou section holds none of Kookmin rules"
  );

  console.log("=== per-university majors are evaluated independently ===");
  const mixed = getApplicationWorkspace({
    program: "GKS-U",
    track: "embassy",
    subtype: "general",
    universities: [
      { name: "Korea Maritime & Ocean University", major: "College of Maritime Sciences" },
      { name: "Korea University", major: "International Relations" },
    ],
  });
  const maritimeItem = sectionFor(mixed, "Korea Maritime & Ocean University").items.find(
    (i) => i.label === "Seafarer's Medical Certificate"
  );
  ok(maritimeItem?.status === "required", "the maritime major makes the KMOU certificate required for that slot");
  const noMajor = getApplicationWorkspace({
    program: "GKS-U",
    track: "embassy",
    subtype: "general",
    universities: [{ name: "Korea Maritime & Ocean University", major: "" }],
  });
  ok(
    sectionFor(noMajor, "Korea Maritime & Ocean University").items.find(
      (i) => i.label === "Seafarer's Medical Certificate"
    )?.status === "conditional",
    "and the same document stays conditional when no maritime major is named"
  );
  ok(
    sectionFor(mixed, "Korea University").items.every((i) => i.label !== "Seafarer's Medical Certificate"),
    "one slot major never alters another slot requirements"
  );

  console.log("=== progress key survives reordering and removal ===");
  const key = storageKeyFor("GKS-U", "embassy", "general");
  ok(!key.includes("Korea University"), "no university name is part of the key, so reordering cannot lose progress");
  ok(
    storageKeyFor("GKS-U", "embassy", "general") !== storageKeyFor("GKS-U", "embassy", "r_gks"),
    "different routes keep separate applications"
  );

  console.log("=== profile university names resolve conservatively ===");
  const resolver = createNameResolver(r.map((rec) => rec.university as string));
  ok(resolver.resolve("Korea University") === "Korea University", "an exact name resolves");
  ok(
    resolver.resolve("POSTECH (Pohang University of Science and Technology)") ===
      "Pohang University of Science and Technology (POSTECH)",
    "an acronym-order flip resolves"
  );
  ok(resolver.resolve("KAIST (Korea Advanced Institute of Science and Technology)") !== null, "KAIST resolves");
  ok(resolver.resolve("Gumi University") === null, "a university absent from the requirement dataset resolves to nothing");
  // These two used to be refused by the old fuzzy pass. They are now handled by
  // explicit aliases instead, and their full coverage lives in Part 4; what
  // matters here is that resolution still refuses anything not spelled out.
  ok(resolver.resolve("Academy of Korean Studies, The Graduate School") === null, "a rearranged name is still refused rather than guessed");
  ok(resolver.resolve("Hanyang University (Ansan)") === null, "an unknown campus qualifier is refused rather than attached to a campus");

  console.log("=== safety rules survive the rewrite ===");
  const DISPLAYABLE = ["required", "conditional", "optional", "not_stated"];
  ok(
    three.common.every((i) => DISPLAYABLE.includes(i.status)),
    "common documents carry only the four displayable statuses"
  );
  ok(
    three.universities.every((s) => s.items.every((i) => DISPLAYABLE.includes(i.status))),
    "university items carry only the four displayable statuses"
  );
  const participationOnly = getApplicationWorkspace({
    program: "GKS-G",
    track: "embassy",
    universities: [{ name: "Kyung Hee University", major: "" }],
  });
  ok(
    sectionFor(participationOnly, "Kyung Hee University").items.length === 0,
    "a participation-only record still contributes nothing to a route it never verified"
  );
  ok(participationOnly.common.length === 15, "and the GKS-G common checklist is unaffected");
}

// ---------------------------------------------------------------------------
// Part 4 -- university-name reconciliation
// ---------------------------------------------------------------------------

function NAME_RECONCILIATION_CHECKS() {
  const requirementNames = r.map((rec) => rec.university as string);
  const resolver = createNameResolver(requirementNames);
  const known = new Set(requirementNames);

  console.log("");
  console.log("=== the four naming variants resolve to exactly one canonical name ===");
  const VARIANTS: [string, string][] = [
    ["Hankuk University of Foreign Studies", "Hankuk University of Foreign Studies (HUFS)"],
    ["Hanyang University (Seoul)", "Hanyang University"],
    ["The Academy of Korean Studies", "The Graduate School of Korean Studies, The Academy of Korean Studies"],
    [
      "NCC-GCSP (National Cancer Center Graduate School of Cancer Science and Policy)",
      "National Cancer Center Graduate School",
    ],
  ];
  for (const [variant, canonical] of VARIANTS) {
    const got = resolver.resolve(variant);
    ok(got === canonical, variant + " -> " + JSON.stringify(got));
    ok(got !== null && known.has(got), "and the canonical name exists in the requirement dataset");
    // Resolving must hand back the requirement dataset's own spelling, not the
    // profile's, so every later lookup keys off the canonical record.
    ok(got !== variant || known.has(variant), "the canonical spelling is preserved, not the profile spelling");
  }

  console.log("=== the six universities with no verified record stay unmatched ===");
  const ABSENT = [
    "Gumi University",
    "Hosan University",
    "Yeungjin University",
    "Vision College of Jeonju",
    "Korea University of Media Arts",
    "Hanyang Women's University",
  ];
  for (const name of ABSENT) {
    ok(resolver.resolve(name) === null, name + " remains unmatched");
    ok(!known.has(name), "and is genuinely absent from the requirement dataset");
  }

  console.log("=== no unrelated university is affected ===");
  // Hanyang is the case an over-loose rule would break: the profile lists the
  // main campus, ERICA and "(Seoul)" separately, and the dataset lists the
  // first two under their own names.
  ok(resolver.resolve("Hanyang University") === "Hanyang University", "plain Hanyang University still resolves to itself");
  ok(
    resolver.resolve("Hanyang University (ERICA)") === "Hanyang University (ERICA)",
    "Hanyang ERICA still resolves to itself, not to the main campus"
  );
  ok(
    resolver.resolve("Hanyang University (Seoul)") !== resolver.resolve("Hanyang University (ERICA)"),
    "the (Seoul) alias never collapses into ERICA"
  );
  ok(resolver.resolve("Hanyang Women's University") === null, "Hanyang Women's University is not swept up by the Hanyang aliases");
  // Every alias target must be a real, distinct requirement university.
  const targets = Object.values(UNIVERSITY_NAME_ALIASES);
  ok(targets.every((t) => known.has(t)), "every alias points at a name the requirement dataset actually holds");
  ok(new Set(targets).size === targets.length, "no two aliases point at the same canonical university");
  ok(
    Object.keys(UNIVERSITY_NAME_ALIASES).every((k) => !known.has(k)),
    "no alias shadows a name the requirement dataset already matches exactly"
  );
  // Resolution is exact-or-alias only: a near-miss must not resolve.
  ok(resolver.resolve("Korea Universty") === null, "a misspelling does not resolve");
  ok(resolver.resolve("Korea") === null, "a bare prefix does not resolve");
  ok(resolver.resolve("Seoul National University of Science") === null, "a truncated name does not resolve");
  ok(resolver.resolve("") === null, "an empty name does not resolve");

  console.log("=== resolving an alias does not confer eligibility ===");
  // AKS is marked excluded in the requirement dataset. The alias only finds the
  // record; the record's own verdict is unchanged by being found.
  const aks = "The Graduate School of Korean Studies, The Academy of Korean Studies";
  const aksRecords = (r as { university: string; verification: { level: string }; flags: { excluded?: boolean } }[]).filter(
    (rec) => rec.university === aks
  );
  ok(aksRecords.length > 0, "the AKS record is present");
  ok(
    aksRecords.every((rec) => rec.verification.level === "excluded" && rec.flags.excluded === true),
    "and is still marked excluded after alias resolution"
  );
  const aksWorkspace = getApplicationWorkspace({
    program: "GKS-G",
    track: "university",
    universities: [{ name: aks, major: "" }],
  });
  ok(
    aksWorkspace.universities[0].items.length === 0,
    "AKS contributes no requirements to a route its record never verified"
  );
  const aksEmbassy = getApplicationWorkspace({
    program: "GKS-G",
    track: "embassy",
    universities: [{ name: aks, major: "" }],
  });
  ok(aksEmbassy.universities[0].items.length === 0, "and none on the Embassy route either");

  // NCC is participation-only rather than excluded: it resolves, but likewise
  // contributes nothing to a route its record does not name.
  const ncc = "National Cancer Center Graduate School";
  const nccWorkspace = getApplicationWorkspace({
    program: "GKS-G",
    track: "university",
    universities: [{ name: ncc, major: "" }],
  });
  ok(nccWorkspace.universities[0].items.length === 0, "NCC likewise gains nothing from being resolved");

  console.log("=== every profile university resolves or is honestly unmatched ===");
  const profileNames = new Set<string>();
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) {
      for (const v of o) {
        if (typeof v === "string") profileNames.add(v);
        else walk(v);
      }
    }
    else if (o && typeof o === "object") for (const v of Object.values(o)) walk(v);
  };
  walk((gksUniversities as { tracks: unknown }).tracks);
  const unresolved = [...profileNames].filter((n) => resolver.resolve(n) === null).sort();
  ok(
    JSON.stringify(unresolved) === JSON.stringify([...ABSENT].sort()),
    "exactly the six absent universities are unresolved: " + JSON.stringify(unresolved)
  );
}

MULTI_UNIVERSITY_CHECKS();
NAME_RECONCILIATION_CHECKS();

console.log("");
console.log(fail ? fail + " FAILURES" : "ALL READINESS INTEGRATION CHECKS PASSED");
process.exit(fail ? 1 : 0);
