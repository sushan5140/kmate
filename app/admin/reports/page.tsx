import type { Metadata } from "next";
import { requireAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { ReportsQueue, type ReportItem, type ReportTargetType } from "@/components/admin/reports-queue";
import { AdminNav } from "@/components/admin/admin-nav";
import { getProfileIdentityMap } from "@/lib/admin/submitter-info";

export const metadata: Metadata = {
  title: "Reports — KMate",
};

interface ReportRow {
  id: string;
  reporter_id: string | null;
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
}

export default async function AdminReportsPage() {
  await requireAdmin();

  const admin = getSupabaseAdmin();
  const { data: reports } = await admin
    .from("reports")
    .select("id, reporter_id, target_type, target_id, reason")
    .eq("status", "open")
    .order("created_at", { ascending: true });

  const rows = (reports ?? []) as ReportRow[];

  const questionIds = rows.filter((r) => r.target_type === "question").map((r) => r.target_id);
  const ecaIds = rows.filter((r) => r.target_type === "eca").map((r) => r.target_id);
  const mistakeIds = rows.filter((r) => r.target_type === "mistake").map((r) => r.target_id);

  // Reported content isn't necessarily still pending (a report can land on
  // something already approved/rejected), so these are looked up by id alone
  // -- no status filter -- unlike the moderation queues above.
  const [{ data: questions }, { data: ecaEntries }, { data: mistakeEntries }] = await Promise.all([
    questionIds.length
      ? admin.from("interview_questions").select("id, text, submitted_by").in("id", questionIds)
      : Promise.resolve({ data: [] as { id: string; text: string; submitted_by: string | null }[] }),
    ecaIds.length
      ? admin.from("eca_entries").select("id, title, submitted_by").in("id", ecaIds)
      : Promise.resolve({ data: [] as { id: string; title: string; submitted_by: string | null }[] }),
    mistakeIds.length
      ? admin.from("mistake_entries").select("id, title, submitted_by").in("id", mistakeIds)
      : Promise.resolve({ data: [] as { id: string; title: string; submitted_by: string | null }[] }),
  ]);

  const questionById = new Map((questions ?? []).map((q) => [q.id, q]));
  const ecaById = new Map((ecaEntries ?? []).map((e) => [e.id, e]));
  const mistakeById = new Map((mistakeEntries ?? []).map((m) => [m.id, m]));

  function resolveTarget(r: ReportRow): { targetUserId: string | null; snippet: string | null } {
    if (r.target_type === "profile") return { targetUserId: r.target_id, snippet: null };
    if (r.target_type === "question") {
      const q = questionById.get(r.target_id);
      return { targetUserId: q?.submitted_by ?? null, snippet: q?.text ?? null };
    }
    if (r.target_type === "eca") {
      const e = ecaById.get(r.target_id);
      return { targetUserId: e?.submitted_by ?? null, snippet: e?.title ?? null };
    }
    if (r.target_type === "mistake") {
      const m = mistakeById.get(r.target_id);
      return { targetUserId: m?.submitted_by ?? null, snippet: m?.title ?? null };
    }
    return { targetUserId: null, snippet: null };
  }

  const resolved = rows.map((r) => ({ ...r, ...resolveTarget(r) }));

  const identityMap = await getProfileIdentityMap(admin, [
    ...resolved.map((r) => r.reporter_id),
    ...resolved.map((r) => r.targetUserId),
  ]);

  const items: ReportItem[] = resolved.map((r) => ({
    id: r.id,
    reason: r.reason,
    targetType: r.target_type,
    snippet: r.snippet,
    reporter: r.reporter_id ? identityMap.get(r.reporter_id) ?? null : null,
    target: r.targetUserId ? identityMap.get(r.targetUserId) ?? null : null,
  }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Moderation queue</h1>
      <p className="mt-1 text-[13.5px] text-muted">Open reports awaiting review.</p>
      <div className="mt-4">
        <AdminNav active="/admin/reports" />
      </div>
      <div className="mt-6">
        <ReportsQueue items={items} />
      </div>
    </main>
  );
}
