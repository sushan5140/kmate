import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { LiveVerifiedDeadline } from "./live-schema";

/**
 * Loads the live verified deadlines the applicant-facing matcher merges in.
 *
 * Only `status = 'active'`. A superseded or revoked row stays in the table
 * for history and audit, and never reaches an applicant again -- which is
 * what makes reverting a verification actually take effect in the product
 * rather than only in the admin's queue.
 *
 * Reads through the service-role client on the server. The table also carries
 * a select policy limited to active rows, so even a direct anonymous read
 * could not see a revoked deadline; the two layers agree.
 */
export async function getLiveVerifiedDeadlines(): Promise<LiveVerifiedDeadline[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("verified_deadlines")
    .select(
      "id, program, track, cycle, deadline_type, label, deadline, timezone, scope_type, country, university, source_url, source_notice_id, confidence, verification_source"
    )
    .eq("status", "active")
    .order("deadline", { ascending: true });

  // A failed read yields no live deadlines rather than a broken page: the
  // curated dataset still renders, which is the safe degradation.
  if (error || !data) return [];

  return data.flatMap((d) => {
    if (d.program !== "GKS-U" && d.program !== "GKS-G") return [];
    return [
      {
        id: d.id,
        program: d.program,
        track: (d.track === "embassy" || d.track === "university" ? d.track : null),
        cycle: String(d.cycle),
        deadlineType: d.deadline_type,
        label: d.label,
        deadline: d.deadline,
        timezone: d.timezone,
        scopeType: (d.scope_type ?? "global") as LiveVerifiedDeadline["scopeType"],
        country: d.country,
        university: d.university,
        sourceUrl: d.source_url,
        sourceNoticeId: d.source_notice_id,
        confidence: d.confidence === null ? null : Number(d.confidence),
        verificationSource: d.verification_source as "assistant" | "admin",
      },
    ];
  });
}
