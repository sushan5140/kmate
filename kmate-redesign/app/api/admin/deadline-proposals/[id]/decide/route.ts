import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAudit, revertProposal } from "@/lib/assistant/audit";
import { parseProposal } from "@/lib/assistant/schema";
import { promoteProposal, revokeForProposal } from "@/lib/assistant/promote";

/**
 * An admin's decision on one assistant proposal.
 *
 * The other half of the product rule: the strict gate may create a verified
 * deadline automatically, and so may an explicit decision here. Nothing else.
 *
 * `edit` re-validates the admin's values through the same schema the
 * assistant's output goes through -- a hand-typed date gets exactly as much
 * checking as a generated one, and an impossible date is refused rather than
 * stored because a person typed it.
 */

const ACTIONS = ["approve", "edit", "reject", "pending", "revert"] as const;
type Action = (typeof ACTIONS)[number];

interface Body {
  action: Action;
  /** Only for `edit`: the corrected fields. */
  patch?: Record<string, unknown>;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rate = checkRateLimit(`decide-deadline:${user.id}`, 60, 5 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await params;
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  if (body.action === "revert") {
    const result = await revertProposal(id, user.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    // Reverting the decision must also withdraw the deadline it produced.
    // Leaving one live after its verification was undone is exactly the
    // failure this pipeline exists to prevent.
    const { data: after } = await admin
      .from("deadline_proposals").select("status").eq("id", id).maybeSingle();
    let revoked = 0;
    if (after && after.status !== "auto_verified" && after.status !== "admin_verified") {
      ({ revoked } = await revokeForProposal(id, user.id, "verification reverted by admin"));
    }
    return NextResponse.json({ ok: true, restored: result.restored, revokedDeadlines: revoked });
  }

  const { data: prior } = await admin.from("deadline_proposals").select("*").eq("id", id).maybeSingle();
  if (!prior) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  let action: "admin_verified" | "admin_edited_verified" | "rejected_not_deadline" | "reverted";

  if (body.action === "approve") {
    patch = { status: "admin_verified", decided_at: now, decided_by: user.id };
    action = "admin_verified";
  } else if (body.action === "reject") {
    patch = { status: "rejected_not_deadline", decided_at: now, decided_by: user.id };
    action = "rejected_not_deadline";
  } else if (body.action === "pending") {
    // Returning to the queue clears the decision stamp, so a pending row
    // never carries a stale "decided by" from a reversed call.
    patch = { status: "needs_review", decided_at: null, decided_by: null };
    action = "reverted";
  } else {
    // edit + approve: revalidate through the assistant's own schema.
    const merged = {
      classification: body.patch?.classification ?? prior.classification,
      program: body.patch?.program ?? prior.program,
      track: body.patch?.track ?? prior.track,
      cycle: body.patch?.cycle ?? prior.cycle,
      deadline_type: body.patch?.deadline_type ?? prior.deadline_type,
      scope_type: body.patch?.scope_type ?? prior.scope_type,
      country: body.patch?.country ?? prior.country,
      university: body.patch?.university ?? prior.university,
      date: body.patch?.date ?? prior.proposed_date,
      timezone: body.patch?.timezone ?? prior.timezone,
      confidence: prior.confidence,
      evidence: prior.evidence,
      reason: prior.reason,
    };
    const parsed = parseProposal(merged);
    if (!parsed.ok) {
      return NextResponse.json({ error: "invalid_proposal", details: parsed.errors }, { status: 400 });
    }
    const v = parsed.value;
    patch = {
      classification: v.classification,
      program: v.program,
      track: v.track,
      cycle: v.cycle,
      deadline_type: v.deadline_type,
      scope_type: v.scope_type,
      country: v.country,
      university: v.university,
      proposed_date: v.date,
      timezone: v.timezone,
      status: "admin_verified",
      decided_at: now,
      decided_by: user.id,
    };
    action = "admin_edited_verified";
  }

  patch.updated_at = now;
  const { data: saved, error } = await admin
    .from("deadline_proposals")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error || !saved) return NextResponse.json({ error: "server_error" }, { status: 500 });

  await writeAudit({
    entityType: "deadline_proposal",
    entityId: id,
    action,
    actorType: "admin",
    actorId: user.id,
    previousValue: prior,
    newValue: saved,
    confidence: prior.confidence,
    evidence: prior.evidence,
    reason: `admin ${body.action}`,
    sourceUrl: prior.source_url,
  });

  // Promotion and revocation, driven by the status the decision produced.
  let promotion: { ok: boolean; reason?: string } | null = null;
  let revokedDeadlines = 0;
  if (saved.status === "admin_verified") {
    promotion = await promoteProposal(id, user.id);
  } else {
    ({ revoked: revokedDeadlines } = await revokeForProposal(id, user.id, `admin ${body.action}`));
  }

  return NextResponse.json({ ok: true, status: saved.status, promotion, revokedDeadlines });
}
