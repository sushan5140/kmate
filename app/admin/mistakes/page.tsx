import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { ModerationQueue, type ModerationItem } from "@/components/admin/moderation-queue";
import { AdminNav } from "@/components/admin/admin-nav";
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
  const user = await getAuthenticatedUser();
  if (!user) notFound();

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) notFound();

  const { data: pending } = await admin
    .from("mistake_entries")
    .select("id, title, description, document_type, reason_category")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const items: ModerationItem[] = (pending ?? []).map((m) => ({
    id: m.id,
    primaryText: m.description ? `${m.title} — ${m.description}` : m.title,
    secondaryText: `${MISTAKE_DOCUMENT_TYPE_LABELS[m.document_type as MistakeDocumentType]} · ${MISTAKE_REASON_CATEGORY_LABELS[m.reason_category as MistakeReasonCategory]}`,
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
