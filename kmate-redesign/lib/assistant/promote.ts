import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { writeAudit } from "./audit";

/**
 * Promotion: the only path from a proposal to an applicant-facing deadline.
 *
 * The product rule, enforced here rather than trusted to callers: a verified
 * deadline may be created by exactly two things, the strict auto-verify gate
 * passing in full, or an explicit admin approval. `promoteProposal` refuses
 * every other proposal status outright, so a needs_review or
 * rejected_not_deadline row cannot reach applicants even if some future
 * caller asks it to.
 *
 * The reverse direction matters just as much. Reverting or rejecting a
 * verification revokes the live row, because leaving a deadline in front of
 * applicants after its verification was withdrawn is the failure mode this
 * whole pipeline exists to avoid.
 */

const PROMOTABLE = ["auto_verified", "admin_verified"] as const;

/** Types that describe something to DO by a date. Others are schedule facts. */
const PROMOTABLE_TYPES = ["application_deadline", "document_deadline"] as const;

export interface PromoteResult {
  ok: boolean;
  reason?: string;
  verifiedDeadlineId?: string;
}

export async function promoteProposal(proposalId: string, actorId?: string | null): Promise<PromoteResult> {
  const admin = getSupabaseAdmin();

  const { data: p } = await admin.from("deadline_proposals").select("*").eq("id", proposalId).maybeSingle();
  if (!p) return { ok: false, reason: "proposal not found" };

  if (!(PROMOTABLE as readonly string[]).includes(p.status)) {
    return { ok: false, reason: `status "${p.status}" is not promotable` };
  }
  if (p.classification !== "deadline") {
    return { ok: false, reason: `classification "${p.classification}" is not a deadline` };
  }
  if (!p.proposed_date || !p.program || !p.cycle || !p.deadline_type) {
    return { ok: false, reason: "the proposal is missing a date, programme, cycle or type" };
  }
  if (!(PROMOTABLE_TYPES as readonly string[]).includes(p.deadline_type)) {
    // An interview or result date is a correctly-typed schedule fact and is
    // kept as a proposal, but it is not something to meet by a date and never
    // becomes a countdown.
    return { ok: false, reason: `type "${p.deadline_type}" is a schedule date, not a deadline to meet` };
  }

  const { data: prior } = await admin
    .from("verified_deadlines")
    .select("*")
    .eq("proposal_id", proposalId)
    .maybeSingle();

  const values = {
    program: p.program,
    track: p.track,
    cycle: String(p.cycle),
    deadline_type: p.deadline_type,
    label: buildLabel(p.program, p.track, p.deadline_type),
    deadline: p.proposed_date,
    timezone: p.timezone,
    scope_type: p.scope_type ?? "global",
    country: p.country,
    university: p.university,
    source_url: p.source_url,
    source_notice_id: null as string | null,
    proposal_id: proposalId,
    verification_source: p.status === "auto_verified" ? "assistant" : "admin",
    confidence: p.confidence,
    status: "active",
    verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await admin
    .from("verified_deadlines")
    .upsert(values, { onConflict: "proposal_id" })
    .select("id")
    .maybeSingle();

  if (error || !saved) return { ok: false, reason: error?.message ?? "insert returned no row" };

  await writeAudit({
    entityType: "verified_deadline",
    entityId: saved.id,
    action: p.status === "auto_verified" ? "auto_verified" : "admin_verified",
    actorType: p.status === "auto_verified" ? "assistant" : "admin",
    actorId: actorId ?? null,
    previousValue: prior ?? null,
    newValue: values,
    confidence: p.confidence,
    evidence: p.evidence,
    reason: `promoted from proposal ${proposalId}`,
    sourceUrl: p.source_url,
  });

  return { ok: true, verifiedDeadlineId: saved.id };
}

/**
 * Withdraws a live deadline when its verification is reverted or rejected.
 *
 * Revokes rather than deletes: the row stays for audit and can be traced, but
 * `status = 'revoked'` removes it from every applicant-facing read, both
 * through the server loader and through the table's own select policy.
 */
export async function revokeForProposal(
  proposalId: string,
  actorId: string | null,
  reason: string
): Promise<{ revoked: number }> {
  const admin = getSupabaseAdmin();
  const { data: rows } = await admin
    .from("verified_deadlines")
    .select("*")
    .eq("proposal_id", proposalId)
    .eq("status", "active");

  if (!rows?.length) return { revoked: 0 };

  for (const row of rows) {
    const { error } = await admin
      .from("verified_deadlines")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) continue;

    await writeAudit({
      entityType: "verified_deadline",
      entityId: row.id,
      action: "reverted",
      actorType: actorId ? "admin" : "system",
      actorId,
      previousValue: row,
      newValue: { ...row, status: "revoked" },
      reason,
      sourceUrl: row.source_url,
    });
  }
  return { revoked: rows.length };
}

/** Marks an older deadline superseded by a newer one, with an audit entry. */
export async function supersede(
  oldId: string,
  newId: string,
  actorId: string | null,
  reason: string
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: prior } = await admin.from("verified_deadlines").select("*").eq("id", oldId).maybeSingle();
  if (!prior) return false;

  const { error } = await admin
    .from("verified_deadlines")
    .update({ status: "superseded", superseded_by: newId, updated_at: new Date().toISOString() })
    .eq("id", oldId);
  if (error) return false;

  await writeAudit({
    entityType: "verified_deadline",
    entityId: oldId,
    action: "superseded",
    actorType: actorId ? "admin" : "system",
    actorId,
    previousValue: prior,
    newValue: { ...prior, status: "superseded", superseded_by: newId },
    reason,
    sourceUrl: prior.source_url,
  });
  return true;
}

/** A short human label, built from stated facts only. */
function buildLabel(program: string, track: string | null, type: string): string {
  const kind = type === "document_deadline" ? "document submission deadline" : "application deadline";
  const trackPart = track === "embassy" ? "Embassy Track " : track === "university" ? "University Track " : "";
  return `${program} ${trackPart}${kind}`.replace(/\s+/g, " ").trim();
}
