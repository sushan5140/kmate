/**
 * A fresh-outreach row is counted only after the conditional update actually
 * returns the expected id. PostgREST can succeed with zero rows when another
 * admin has already changed the row.
 *
 * Audit logging is best-effort: an audit failure must be surfaced, but cannot
 * undo a successful queue update.
 */
export type FreshWriteOutcome = {
  outcome: "updated" | "conflict" | "failed";
  auditRecorded: boolean;
};

type WriteResponse = {
  data: { id: string } | null;
  error: { message: string } | null;
};

export async function applyFreshWrite(
  expectedId: string,
  // Supabase PostgREST builders are awaitable PromiseLike values, not native Promises.
  write: () => PromiseLike<WriteResponse>,
  record: () => Promise<boolean>
): Promise<FreshWriteOutcome> {
  let result: WriteResponse;
  try {
    result = await write();
  } catch {
    return { outcome: "failed", auditRecorded: false };
  }

  if (result.error) return { outcome: "failed", auditRecorded: false };
  if (result.data?.id !== expectedId) {
    return { outcome: "conflict", auditRecorded: false };
  }

  try {
    return { outcome: "updated", auditRecorded: await record() };
  } catch {
    return { outcome: "updated", auditRecorded: false };
  }
}

/** Count queue rows omitted from the AI's structured decisions. */
export function countUnansweredRows(
  rows: ReadonlyArray<{ id: string }>,
  drafts: ReadonlyArray<{ id: string }>
): number {
  const answered = new Set(drafts.map((draft) => draft.id));
  return rows.reduce((count, row) => count + (answered.has(row.id) ? 0 : 1), 0);
}
