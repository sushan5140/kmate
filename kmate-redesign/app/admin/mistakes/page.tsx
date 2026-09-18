import type { Metadata } from "next";
import { requireAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { ModerationQueue, type ModerationItem } from "@/components/admin/moderation-queue";
import { AdminNav } from "@/components/admin/admin-nav";
import { getSubmitterInfoMap } from "@/lib/admin/submitter-info";
import {
  MISTAKE_DOCUMENT_TYPE_LABELS,
  MISTAKE_REASON_CATEGORY_LABELS,
  type MistakeDocumentType,
  type MistakeReasonCategory,
} from "@/lib/constants";

export const metadata: Metadata = {
  title: "Mistakes Moderation — KMate",
};

export default async function AdminMistakesPage() {
  await requireAdmin();

  const admin = getSupabaseAdmin();
  const { data: pending } = await admin
    .from("mistake_entries")
    .select("id, title, description, document_type, reason_category, submitted_by")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const submitterInfo = await getSubmitterInfoMap(admin, "mistake_entries", (pending ?? []).map((m) => m.submitted_by));

  const items: ModerationItem[] = (pending ?? []).map((m) => ({
    id: m.id,
    primaryText: m.description ? `${m.title} — ${m.description}` : m.title,
    secondaryText: `${MISTAKE_DOCUMENT_TYPE_LABELS[m.document_type as MistakeDocumentType]} · ${MISTAKE_REASON_CATEGORY_LABELS[m.reason_category as MistakeReasonCategory]}`,
    submitter: m.submitted_by ? submitterInfo.get(m.submitted_by) ?? null : null,
  }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Moderation queue</h1>
      <p className="mt-1 text-[13.5px] text-muted">Pending mistake/rejection-reason submissions awaiting review.</p>
      <div className="mt-4">
        <AdminNav active="/admin/mistakes" />
      </div>
      <div className="mt-6">
        <ModerationQueue items={items} endpointBase="/api/admin/mistakes" />
      </div>
    </main>
  );
}
