import { strict as assert } from "node:assert";
import { validApplicationYears, profileApplicationYears } from "@/lib/deadline";
import { gksU2027Schedule, resolvePlanningRoute } from "@/lib/gks/gks-u-2027-schedule";

const nov = new Date("2026-11-26T09:00:00Z");
assert.deepEqual(validApplicationYears("gks_u", nov), [2027, 2028, 2029]);
assert.deepEqual(validApplicationYears("gks_g", nov), [2027, 2028, 2029]);
assert.ok(validApplicationYears("gks_u", new Date("2026-01-08T12:00:00Z")).includes(2026));
assert.ok(!validApplicationYears("gks_u", new Date("2026-01-09T00:00:00Z")).includes(2026));
assert.ok(validApplicationYears("gks_g", new Date("2026-06-30T12:00:00Z")).includes(2026));
assert.ok(!validApplicationYears("gks_g", new Date("2026-07-01T00:00:00Z")).includes(2026));
assert.deepEqual(validApplicationYears("gks_u", new Date("2028-10-01T00:00:00Z")), [2028, 2029, 2030, 2031]);
assert.deepEqual(validApplicationYears("gks_g", new Date("2028-03-01T00:00:00Z")), [2028, 2029, 2030, 2031]);
assert.deepEqual(profileApplicationYears("gks_u", 2026, nov), [2026, 2027, 2028, 2029]);
assert.deepEqual(profileApplicationYears("gks_g", null, nov), [2027, 2028, 2029]);
assert.deepEqual(profileApplicationYears("gks_u", 20999, nov), [2027, 2028, 2029]);
assert.equal(resolvePlanningRoute("university", "uic"), "university");
assert.equal(resolvePlanningRoute("university", "associate"), "university");
assert.equal(resolvePlanningRoute("embassy", "general"), "general");
assert.equal(resolvePlanningRoute("embassy", "r_gks"), "r_gks");
assert.equal(resolvePlanningRoute("embassy", ""), null);
assert.equal(resolvePlanningRoute("", "general"), null);
for (const day of ["2026-08-01", "2026-09-15", "2026-09-30", "2026-11-26", "2027-01-08"]) {
  const university = gksU2027Schedule("university", day);
  assert.ok(!JSON.stringify(university).includes("Embassy"));
  assert.ok(!university.deadline.includes("Sep 30"));
  assert.ok(university.next.includes("own notice"));
}
assert.equal(gksU2027Schedule("general", "2026-09-15").label, "Scheduled opening day");
assert.equal(gksU2027Schedule("r_gks", "2026-09-30").label, "Scheduled closing day");
assert.ok(gksU2027Schedule("general", "2026-11-26").deadline.endsWith("passed"));
assert.equal(gksU2027Schedule("general", "2027-01-08").label, "Published schedule elapsed");
assert.equal(gksU2027Schedule(null, "2026-11-26").label, "Choose your application route");
console.log("R1 intake and route schedule regression checks passed.");
