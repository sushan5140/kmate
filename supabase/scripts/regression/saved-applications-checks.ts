/**
 * Saved Applications + dashboard summary checks.
 *
 * Run with:  npx tsx --conditions react-server supabase/scripts/regression/saved-applications-checks.ts
 *
 * Covers the supplied model/adapter/storage/summary layer and the two rules
 * that matter most: the saved application never carries document progress, and
 * the dashboard's arithmetic matches what the readiness page itself computes.
 */
import {
  canonicalUniversityId,
  createEmptyStore,
  createSavedApplication,
  normalizeUniversityChoices,
  upsertApplication,
  archiveApplication,
} from "@/lib/applications/model";
import { savedApplicationFromReadiness } from "@/lib/applications/readiness-adapter";
import {
  SAVED_APPLICATIONS_STORAGE_KEY,
  parseSavedApplicationStore,
} from "@/lib/applications/storage";
import {
  buildApplicationDashboardSummary,
  type DashboardReadinessItem,
  type DashboardReadinessSnapshot,
} from "@/lib/applications/summary";
import { getApplicationWorkspace } from "@/lib/readiness";
import { progressOf, overallProgress } from "@/lib/readiness/application";
import type { ReadinessItem } from "@/lib/readiness/schema";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + m);
  if (!c) fail++;
};

const item = (status: string, progress: string): DashboardReadinessItem =>
  ({ status, progress }) as DashboardReadinessItem;

console.log("=== adapter preserves the readiness configuration ===");
const app = savedApplicationFromReadiness({
  program: "GKS-U",
  track: "embassy",
  subtype: "general",
  universities: [
    { name: "Korea University", major: "International Relations" },
    { name: "Yonsei University", major: "Computer Science" },
    { name: "Chonnam National University", major: "Computer Science" },
  ],
});
ok(app.program === "GKS-U" && app.track === "embassy" && app.subtype === "general", "program, track and program type are kept");
ok(
  JSON.stringify(app.universities.map((u) => u.name)) ===
    JSON.stringify(["Korea University", "Yonsei University", "Chonnam National University"]),
  "three universities keep their order"
);
ok(
  JSON.stringify(app.universities.map((u) => u.priority)) === JSON.stringify([1, 2, 3]),
  "priority follows that order"
);
ok(
  app.universities[0].major === "International Relations" && app.universities[1].major === "Computer Science",
  "each university keeps its own major"
);
ok(app.status === "active" && app.version === 1, "saved as an active v1 application");

console.log("=== no document progress is ever stored on the application ===");
const serialised = JSON.stringify(app);
for (const forbidden of ["ready", "in_progress", "missing", "not_applicable", "untracked", "progress"]) {
  ok(!serialised.includes(`"${forbidden}"`), `the saved application carries no "${forbidden}" field`);
}
ok(
  JSON.stringify(Object.keys(app).sort()) ===
    JSON.stringify(["createdAt", "id", "program", "status", "subtype", "track", "universities", "updatedAt", "version"]),
  "its shape is configuration only: " + Object.keys(app).sort().join(", ")
);

console.log("=== duplicates and blanks are dropped ===");
const dupes = savedApplicationFromReadiness({
  program: "GKS-G",
  track: "university",
  universities: [
    { name: "Ajou University" },
    { name: "  " },
    { name: "Ajou University", major: "R&D" },
    { name: "Korea University" },
  ],
});
ok(dupes.universities.length === 2, "a repeated university is stored once (got " + dupes.universities.length + ")");
ok(dupes.subtype === undefined, "an absent program type stays absent rather than becoming an empty string");
ok(canonicalUniversityId("Korea Maritime & Ocean University") === "korea-maritime-and-ocean-university",
   "canonical ids fold '&' and punctuation: " + canonicalUniversityId("Korea Maritime & Ocean University"));
ok(normalizeUniversityChoices([{ name: "A" }, { name: "A" }]).length === 1, "normaliser de-dupes too");

console.log("=== storage refuses anything it does not recognise ===");
ok(SAVED_APPLICATIONS_STORAGE_KEY === "kmate:saved-applications:v1", "the documented key is used");
ok(parseSavedApplicationStore(null).applications.length === 0, "no stored value gives an empty store");
ok(parseSavedApplicationStore("{oh dear").applications.length === 0, "corrupt JSON gives an empty store");
ok(parseSavedApplicationStore(JSON.stringify({ version: 2, applications: [] })).applications.length === 0,
   "a future version is not read as v1");
ok(parseSavedApplicationStore(JSON.stringify({ version: 1, applications: "nope", activeApplicationId: null })).applications.length === 0,
   "a malformed applications list gives an empty store");
const roundTrip = parseSavedApplicationStore(JSON.stringify(upsertApplication(createEmptyStore(), app)));
ok(roundTrip.applications.length === 1 && roundTrip.activeApplicationId === app.id, "a real store round-trips");

console.log("=== upsert updates in place; archive clears the active pointer ===");
const updated = { ...app, subtype: "r_gks", updatedAt: new Date().toISOString() };
const store2 = upsertApplication(upsertApplication(createEmptyStore(), app), updated);
ok(store2.applications.length === 1, "saving the same id updates rather than adding a second application");
ok(store2.applications[0].subtype === "r_gks", "and keeps the new value");
const archived = archiveApplication(store2, app.id);
ok(archived.activeApplicationId === null && archived.applications[0].status === "archived", "archiving clears the active pointer");
ok(createSavedApplication({ program: "GKS-G", track: "embassy" }).universities.length === 0, "an application can start with no universities");

console.log("=== dashboard summary arithmetic ===");
const snapshot: DashboardReadinessSnapshot = {
  common: [
    ...Array.from({ length: 8 }, () => item("required", "ready")),
    ...Array.from({ length: 3 }, () => item("required", "missing")),
    item("conditional", "untracked"),
    item("optional", "untracked"),
  ],
  universities: [
    { name: "Korea University", items: [item("required", "ready"), item("required", "ready"), item("required", "missing")] },
    { name: "Yonsei University", items: [item("required", "ready"), item("required", "in_progress")] },
    { name: "Chonnam National University", items: [item("conditional", "untracked")] },
  ],
};
const summary = buildApplicationDashboardSummary(app, snapshot);
ok(summary.common.requiredReady === 8 && summary.common.requiredTotal === 11, "common is 8 / 11");
ok(summary.overall.requiredReady === 11 && summary.overall.requiredTotal === 16,
   "overall is 11 / 16 (got " + summary.overall.requiredReady + " / " + summary.overall.requiredTotal + ")");
ok(summary.overall.progressPercent === 69, "overall reads 69% (got " + summary.overall.progressPercent + "%)");
ok(summary.universities.length === 3, "every saved university appears");
ok(summary.universities[2].requiredTotal === 0 && summary.universities[2].progressPercent === null,
   "a university with no required items reports null, never 100%");
ok(summary.universities[1].requiredUntracked === 1, "an in-progress required item counts as not yet ready");
ok(summary.overall.requiredMissing === 4, "missing counts across common and universities (got " + summary.overall.requiredMissing + ")");

console.log("=== conditional and optional never lower the percentage ===");
const leaner: DashboardReadinessSnapshot = {
  common: snapshot.common.filter((i) => i.status === "required"),
  universities: snapshot.universities.map((u) => ({ ...u, items: u.items.filter((i) => i.status === "required") })),
};
ok(
  buildApplicationDashboardSummary(app, leaner).overall.progressPercent === summary.overall.progressPercent,
  "dropping every conditional and optional item leaves the percentage at " + summary.overall.progressPercent + "%"
);
ok(summary.overall.conditionalTotal === 2 && summary.overall.optionalTotal === 1, "they are counted separately for display");

console.log("=== a saved university with no snapshot is reported, not silently zeroed ===");
const missingOne = buildApplicationDashboardSummary(app, { common: [], universities: [] });
ok(missingOne.universities.length === 3, "all three still appear when readiness data is unavailable");
ok(missingOne.universities.every((u) => u.requiredTotal === 0 && u.progressPercent === null),
   "each reports null progress rather than a fabricated figure");
ok(missingOne.universities[0].major === "International Relations", "and keeps the major stored on the application");

console.log("=== the summary agrees with the readiness page's own figures ===");
// Same three universities, run through the real dataset rather than fixtures.
const workspace = getApplicationWorkspace({
  program: "GKS-U",
  track: "embassy",
  subtype: "general",
  universities: [
    { name: "Korea Maritime & Ocean University", major: "College of Maritime Sciences" },
    { name: "Yonsei University", major: "" },
    { name: "Ewha Womans University", major: "" },
  ],
});
const untrack = (items: ReadinessItem[]): DashboardReadinessItem[] =>
  items.map((i) => ({ status: i.status, progress: "untracked" }) as DashboardReadinessItem);
const realApp = savedApplicationFromReadiness({
  program: "GKS-U",
  track: "embassy",
  subtype: "general",
  universities: workspace.universities.map((u) => ({ name: u.university, major: u.major })),
});
const realSummary = buildApplicationDashboardSummary(realApp, {
  common: untrack(workspace.common),
  universities: workspace.universities.map((u) => ({ name: u.university, major: u.major, items: untrack(u.items) })),
});
const readinessOverall = overallProgress(
  progressOf(workspace.common.map((i) => ({ ...i, progress: "untracked" }) as ReadinessItem)),
  workspace.universities.map((u) => progressOf(u.items.map((i) => ({ ...i, progress: "untracked" }) as ReadinessItem)))
);
ok(realSummary.overall.requiredTotal === readinessOverall.requiredTotal,
   "overall required total matches the readiness page (" + realSummary.overall.requiredTotal + ")");
ok(realSummary.overall.requiredReady === readinessOverall.requiredReady, "overall ready matches");
ok(
  realSummary.common.requiredTotal === progressOf(workspace.common.map((i) => ({ ...i, progress: "untracked" }) as ReadinessItem)).requiredTotal,
  "common required total matches"
);
for (const u of workspace.universities) {
  const mine = realSummary.universities.find((x) => x.name === u.university)!;
  const theirs = progressOf(u.items.map((i) => ({ ...i, progress: "untracked" }) as ReadinessItem));
  ok(mine.requiredTotal === theirs.requiredTotal, u.university + ": required total matches (" + mine.requiredTotal + ")");
}

console.log("");
console.log(fail ? fail + " FAILURES" : "ALL SAVED-APPLICATION CHECKS PASSED");
process.exit(fail ? 1 : 0);
