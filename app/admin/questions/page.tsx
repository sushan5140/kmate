import type { Metadata } from "next";
import { requireAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { ModerationQueue, type ModerationItem } from "@/components/admin/moderation-queue";
import { AdminNav } from "@/components/admin/admin-nav";
import { getSubmitterInfoMap } from "@/lib/admin/submitter-info";
import { QUESTION_CATEGORY_LABELS, type QuestionCategory } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Moderation — KMate",
};

export default async function AdminQuestionsPage() {
  await requireAdmin(); // non-enumerable: unauthorized visitors get a plain 404, not a login prompt

  const admin = getSupabaseAdmin();
  const { data: pending } = await admin
    .from("interview_questions")
    .select("id, text, category, kind, submitted_by")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const submitterInfo = await getSubmitterInfoMap(admin, "interview_questions", (pending ?? []).map((q) => q.submitted_by));

  const items: ModerationItem[] = (pending ?? []).map((q) => ({
    id: q.id,
    primaryText: q.text,
    secondaryText: `${QUESTION_CATEGORY_LABELS[q.category as QuestionCategory]} · ${q.kind === "interviewer" ? "Ask the interviewer" : "Interview question"}`,
    submitter: q.submitted_by ? submitterInfo.get(q.submitted_by) ?? null : null,
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
