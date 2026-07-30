import type { Metadata } from "next";
import { requireAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { ModerationQueue, type ModerationItem } from "@/components/admin/moderation-queue";
import { AdminNav } from "@/components/admin/admin-nav";
import { ECA_TRACK_LABELS, type EcaTrack } from "@/lib/constants";

export const metadata: Metadata = {
  title: "ECA Moderation — KMate",
};

export default async function AdminEcaPage() {
  await requireAdmin();

  const admin = getSupabaseAdmin();
  const { data: pending } = await admin
    .from("eca_entries")
    .select("id, title, description, track")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const items: ModerationItem[] = (pending ?? []).map((e) => ({
    id: e.id,
    primaryText: e.description ? `${e.title} — ${e.description}` : e.title,
    secondaryText: ECA_TRACK_LABELS[e.track as EcaTrack],
  }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Moderation queue</h1>
      <p className="mt-1 text-[13.5px] text-muted">Pending extracurricular submissions awaiting review.</p>
      <div className="mt-4">
        <AdminNav active="/admin/eca" />
      </div>
      <div className="mt-6">
        <ModerationQueue items={items} endpointBase="/api/admin/eca" />
      </div>
    </main>
  );
}
