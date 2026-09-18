import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Immutable decision history, and the rollback it makes possible.
 *
 * The audit found that content moderation kept no history at all: approving
 * or rejecting a notice overwrote `reviewed_by`/`reviewed_at` in place, and
 * `admin_actions_log` was written only by the three user-management routes.
 * Nothing recorded what a value used to be, so nothing could be undone.
 *
 * Every write here appends. Nothing in this module updates or deletes a row
 * in content_audit_log -- that is what makes `revert` trustworthy, because
 * the previous snapshot is still there to restore from.
 */

export type AuditAction =
  | "assistant_proposed"
  | "auto_verified"
  | "admin_verified"
  | "admin_edited_verified"
  | "rejected_not_deadline"
  | "superseded"
  | "reverted";

export type ActorType = "assistant" | "admin" | "system";

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorType: ActorType;
  actorId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  confidence?: number | null;
  evidence?: string | null;
  reason?: string | null;
  sourceUrl?: string | null;
}

/**
 * Appends one decision to the history.
 *
 * Deliberately does not throw on failure: an audit write must never be the
 * reason a legitimate admin action fails. It is logged loudly instead, so a
 * silently un-audited system is still visible in the server logs.
 */
export async function writeAudit(entry: AuditEntry): Promise<boolean> {
  const { error } = await getSupabaseAdmin().from("content_audit_log").insert({
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    action: entry.action,
    actor_type: entry.actorType,
    actor_id: entry.actorId ?? null,
    previous_value: entry.previousValue ?? null,
    new_value: entry.newValue ?? null,
    confidence: entry.confidence ?? null,
    evidence: entry.evidence ?? null,
    reason: entry.reason ?? null,
    source_url: entry.sourceUrl ?? null,
  });
  if (error) {
    console.error("[audit] failed to record", entry.action, "on", entry.entityType, entry.entityId, error.message);
    return false;
  }
  return true;
}

/** Full history for one entity, newest first. */
export async function historyFor(entityType: string, entityId: string) {
  const { data } = await getSupabaseAdmin()
    .from("content_audit_log")
    .select("id, action, actor_type, actor_id, previous_value, new_value, confidence, reason, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

const REVERTIBLE_COLUMNS = [
  "classification",
  "program",
  "track",
  "cycle",
  "deadline_type",
  "scope_type",
  "country",
  "university",
  "proposed_date",
  "timezone",
  "status",
  "supersedes_id",
] as const;

export interface RevertResult {
  ok: boolean;
  error?: string;
  restored?: Record<string, unknown>;
}

/**
 * Restores a deadline proposal to the state recorded before its most recent
 * decision, and records the revert itself as a new entry.
 *
 * Two properties worth stating: the restore reads the PREVIOUS snapshot from
 * history rather than reconstructing it, so it cannot drift from what was
 * actually there; and the revert is itself appended, so an undo is as
 * auditable as the action it undid. History is never rewritten.
 */
export async function revertProposal(
  proposalId: string,
  adminId: string
): Promise<RevertResult> {
  const admin = getSupabaseAdmin();

  const { data: entries } = await admin
    .from("content_audit_log")
    .select("id, action, previous_value, created_at")
    .eq("entity_type", "deadline_proposal")
    .eq("entity_id", proposalId)
    .order("created_at", { ascending: false })
    .limit(10);

  // The newest entry that actually captured a prior state. An
  // assistant_proposed row has no previous value -- there was nothing before it.
  const restorable = (entries ?? []).find(
    (e) => e.previous_value !== null && e.action !== "reverted"
  );
  if (!restorable) return { ok: false, error: "no previous state recorded for this proposal" };

  const snapshot = restorable.previous_value as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const col of REVERTIBLE_COLUMNS) {
    if (col in snapshot) patch[col] = snapshot[col];
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "the recorded snapshot held no revertible fields" };
  }

  const { data: current } = await admin
    .from("deadline_proposals")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();

  patch.updated_at = new Date().toISOString();
  const { error } = await admin.from("deadline_proposals").update(patch).eq("id", proposalId);
  if (error) return { ok: false, error: error.message };

  await writeAudit({
    entityType: "deadline_proposal",
    entityId: proposalId,
    action: "reverted",
    actorType: "admin",
    actorId: adminId,
    previousValue: current ?? null,
    newValue: patch,
    reason: `reverted to the state recorded before ${restorable.action}`,
  });

  return { ok: true, restored: patch };
}
