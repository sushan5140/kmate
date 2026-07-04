import type { Metadata } from "next";
import { requireOnboarded, createClient } from "@/lib/supabase/auth-server";
import { QuestionFilters } from "@/components/interview-db/question-filters";
import { QuestionCard, type QuestionCardData } from "@/components/interview-db/question-card";
import { SubmitQuestionForm } from "@/components/interview-db/submit-question-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Interview DB — GKS Connect",
};

interface QuestionRow {
  id: string;
  text: string;
  category: QuestionCardData["category"];
  upvotes_count: number;
  status: QuestionCardData["status"];
  question_upvotes: { user_id: string }[];
}

export default async function InterviewDbPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; relevant?: string }>;
}) {
  const user = await requireOnboarded("/interview-db");
  const params = await searchParams;
  const supabase = await createClient(); // RLS-respecting: only approved + own + admin rows come back

  let query = supabase
    .from("interview_questions")
    .select("id, text, category, upvotes_count, status, question_upvotes ( user_id )")
    .order("upvotes_count", { ascending: false });

  if (params.category) {
    query = query.eq("category", params.category);
  } else if (params.relevant === "1") {
    // Categories tied most directly to a specific major/university, since
    // questions here aren't individually tagged by major/university.
    query = query.in("category", ["major_specific", "korea_specific"]);
  }

  const { data } = await query;

  const questions: QuestionCardData[] = ((data ?? []) as unknown as QuestionRow[]).map((q) => ({
    id: q.id,
    text: q.text,
    category: q.category,
    upvotesCount: q.upvotes_count,
    upvotedByMe: q.question_upvotes.some((u) => u.user_id === user.id),
    status: q.status,
  }));

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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <QuestionFilters />
        <SubmitQuestionForm />
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {questions.length === 0 ? (
          <p className="text-[14px] text-muted">No questions match this filter yet.</p>
        ) : (
          questions.map((q) => <QuestionCard key={q.id} question={q} />)
        )}
      </div>
    </main>
  );
}
