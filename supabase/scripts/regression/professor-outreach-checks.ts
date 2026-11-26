import assert from "node:assert/strict";
import {
  EMPTY_OUTREACH_DRAFT, MAX_OUTREACH_RECORDS, filterOutreachRecords, isFollowUpDue,
  isOutreachDate, localOutreachDate, normalizeFacultyUrl, parseOutreachRecords,
  removeOutreachRecord, upsertOutreachRecord, validateOutreachDraft,
  type OutreachRecord,
} from "../../../lib/outreach/model";

const draft = { ...EMPTY_OUTREACH_DRAFT, professor: " Example Lab ", university: "Example University",
  department: "Computer Science", researchFit: "Graph learning", officialUrl: "https://example.edu/lab",
  status: "contacted" as const, contactedOn: "2026-11-20", followUpOn: "2026-11-26" };
const validated = validateOutreachDraft(draft);
assert.equal(validated.error, null);
if (validated.error !== null) throw Error(validated.error);
const record: OutreachRecord = { ...validated.draft, id: "example-1" };
assert.equal(record.professor, "Example Lab");
assert.equal(validateOutreachDraft(EMPTY_OUTREACH_DRAFT).error !== null, true);
assert.equal(validateOutreachDraft({ ...draft, notes: "x".repeat(1001) }).error !== null, true);
assert.equal(validateOutreachDraft({ ...draft, followUpOn: "2026-11-19" }).error !== null, true);
assert.equal(validateOutreachDraft({ ...draft, contactedOn: "2026-02-30" }).error !== null, true);
assert.equal(isOutreachDate("2028-02-29"), true);
assert.equal(isOutreachDate("2026-02-29"), false);
for (const url of ["javascript:alert(1)", "http://example.edu", "https://user:password@example.edu", "not a URL"]) assert.equal(normalizeFacultyUrl(url), null);
assert.equal(normalizeFacultyUrl(""), "");
assert.equal(normalizeFacultyUrl(" https://example.edu/lab "), "https://example.edu/lab");
assert.deepEqual(parseOutreachRecords(null), []);
assert.deepEqual(parseOutreachRecords("{bad json"), []);
assert.deepEqual(parseOutreachRecords("{}"), []);
assert.deepEqual(parseOutreachRecords(JSON.stringify([record, record, { ...record, id: "bad", status: "fake" }, { ...record, id: "bad-url", officialUrl: "javascript:alert(1)" }, null, 42])), [record]);
const added = upsertOutreachRecord([], record);
assert.deepEqual(added, [record]);
assert.deepEqual(upsertOutreachRecord(added, { ...record, status: "replied" }), [{ ...record, status: "replied" }]);
assert.deepEqual(removeOutreachRecord(added, record.id), []);
assert.deepEqual(removeOutreachRecord(added, "missing"), added);
assert.equal(isFollowUpDue(record, "2026-11-26"), true);
assert.equal(isFollowUpDue(record, "2026-11-25"), false);
assert.equal(isFollowUpDue({ ...record, status: "replied" }, "2026-11-26"), false);
assert.equal(isFollowUpDue({ ...record, contactedOn: "" }, "2026-11-26"), false);
assert.equal(localOutreachDate(new Date(2026, 10, 26)), "2026-11-26");
assert.deepEqual(filterOutreachRecords(added, "graph", "due", "2026-11-26"), added);
assert.deepEqual(filterOutreachRecords(added, "GRAPH", "all", "2026-11-26"), added);
assert.deepEqual(filterOutreachRecords(added, "missing", "all", "2026-11-26"), []);
assert.deepEqual(filterOutreachRecords(added, "", "closed", "2026-11-26"), []);
const full = Array.from({ length: MAX_OUTREACH_RECORDS }, (_, index) => ({ ...record, id: "id-" + index }));
assert.equal(upsertOutreachRecord(full, record).length, MAX_OUTREACH_RECORDS);
assert.equal(parseOutreachRecords(JSON.stringify([...full, record])).length, MAX_OUTREACH_RECORDS);
assert.equal(upsertOutreachRecord(full, { ...full[0], status: "closed" })[0].status, "closed");
console.log("Professor outreach model regression checks passed.");
