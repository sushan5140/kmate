import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { ModerationQueue, type ModerationItem } from "@/components/admin/moderation-queue";
import { AdminNav } from "@/components/admin/admin-nav";
import { QUESTION_CATEGORY_LABELS, type QuestionCategory } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Moderation — KMate",
};

export default async function AdminQuestionsPage() {
  const user = await getAuthenticatedUser();
  if (!user) notFound(); // non-enumerable: signed-out visitors get a plain 404, not a login prompt

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) notFound();

  const { data: pending } = await admin
    .from("interview_questions")
    .select("id, text, category, kind")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const items: ModerationItem[] = (pending ?? []).map((q) => ({
    id: q.id,
    primaryText: q.text,
    secondaryText: `${QUESTION_CATEGORY_LABELS[q.category as QuestionCategory]} · ${q.kind === "interviewer" ? "Ask the interviewer" : "Interview question"}`,
  }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Moderation queue</h1>
      <p className="mt-1 text-[13.5px] text-muted">Pending interview and ask-the-interviewer questions awaiting review.</p>
      <div className="mt-4">
        <AdminNav active="/admin/questions" />
      </div>
      <div className="mt-6">
        <ModerationQueue items={items} endpointBase="/api/admin/questions" />
      </div>
    </main>
  );
}
