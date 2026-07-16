import type { Metadata } from "next";
import { requireOnboarded, createClient } from "@/lib/supabase/auth-server";
import { QuestionBrowser } from "@/components/interview-db/question-browser";
import { SubmitQuestionForm } from "@/components/interview-db/submit-question-form";
import { Card } from "@/components/ui/card";
import type { QuestionCardData } from "@/components/interview-db/question-card";

export const metadata: Metadata = {
  title: "Interview DB — KMate",
};

interface QuestionRow {
  id: string;
  text: string;
  category: QuestionCardData["category"];
  upvotes_count: number;
  downvotes_count: number;
  status: QuestionCardData["status"];
  question_upvotes: { user_id: string; vote_type: "up" | "down" }[];
}

export default async function InterviewDbPage() {
  const user = await requireOnboarded("/interview-db");
  const supabase = await createClient(); // RLS-respecting: only approved + own + admin rows come back

  const [{ data: questionRows }, { data: draftRows }] = await Promise.all([
    supabase
      .from("interview_questions")
      .select("id, text, category, upvotes_count, downvotes_count, status, question_upvotes ( user_id, vote_type )")
      .eq("kind", "interview")
      .order("upvotes_count", { ascending: false }),
    supabase.from("draft_answers").select("question_id, content").eq("user_id", user.id),
  ]);

  const draftsByQuestionId = new Map((draftRows ?? []).map((d) => [d.question_id, d.content]));

  const questions: QuestionCardData[] = ((questionRows ?? []) as unknown as QuestionRow[]).map((q) => {
    const myVote = q.question_upvotes.find((u) => u.user_id === user.id);
    return {
      id: q.id,
      text: q.text,
      category: q.category,
      upvotesCount: q.upvotes_count,
      downvotesCount: q.downvotes_count,
      voteType: myVote?.vote_type ?? null,
      status: q.status,
      draftContent: draftsByQuestionId.get(q.id) ?? "",
    };
  });

  const totalApproved = questions.filter((q) => q.status === "approved").length;
  const initialDraftedCount = (draftRows ?? []).filter((d) => d.content.trim().length > 0).length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Interview DB</h1>

      <Card className="mt-4">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Prep guide</p>
        <h2 className="mt-1 text-[16px] font-semibold text-ink">What to expect</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          GKS interviews are typically 10-20 minutes, either one-on-one or panel-style,
          conducted in person or online depending on your track and embassy/university.
          Expect questions about your motivation, academic background, and why Korea
          specifically -- plus a few curveballs to see how you think on your feet. Arrive
          with clear, honest answers rather than memorized scripts, and prepare 1-2
          questions of your own to ask at the end.
        </p>
      </Card>

      <div className="mt-6 flex items-center justify-end gap-3">
        <SubmitQuestionForm />
      </div>

      <QuestionBrowser questions={questions} initialDraftedCount={initialDraftedCount} totalApproved={totalApproved} />
    </main>
  );
}
