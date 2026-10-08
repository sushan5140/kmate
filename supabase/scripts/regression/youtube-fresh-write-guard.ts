import assert from "node:assert/strict";
import { applyFreshWrite } from "../../../lib/youtube/fresh-write-guard";

async function main() {
  let auditCalls = 0;
  const audit = async () => { auditCalls++; return true; };
  const success = async () => ({ data: { id: "row-1" }, error: null });

  assert.deepEqual(
    await applyFreshWrite("row-1", success, audit),
    { outcome: "updated", auditRecorded: true },
    "successful conditional update is counted and audited"
  );
  assert.equal(auditCalls, 1);

  assert.deepEqual(
    await applyFreshWrite("row-1", async () => ({ data: null, error: { message: "write failed" } }), audit),
    { outcome: "failed", auditRecorded: false },
    "database write failure is not counted"
  );
  assert.deepEqual(
    await applyFreshWrite("row-1", async () => ({ data: null, error: null }), audit),
    { outcome: "conflict", auditRecorded: false },
    "zero updated rows means concurrent change, not success"
  );
  assert.deepEqual(
    await applyFreshWrite("row-1", async () => ({ data: { id: "another-row" }, error: null }), audit),
    { outcome: "conflict", auditRecorded: false },
    "unexpected returned id is not counted"
  );
  assert.deepEqual(
    await applyFreshWrite("row-1", async () => { throw new Error("network"); }, audit),
    { outcome: "failed", auditRecorded: false },
    "thrown write is not counted"
  );
  assert.equal(auditCalls, 1, "failed and conflicted updates never emit audit events");

  assert.deepEqual(
    await applyFreshWrite("row-1", success, async () => false),
    { outcome: "updated", auditRecorded: false },
    "audit insert failure is reported separately from persisted update"
  );
  assert.deepEqual(
    await applyFreshWrite("row-1", success, async () => { throw new Error("audit offline"); }),
    { outcome: "updated", auditRecorded: false },
    "audit exceptions do not disguise successful queue updates"
  );

  console.log("YouTube fresh-write guards: 7 regression cases passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
