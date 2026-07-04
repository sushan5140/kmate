import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOnboarded, createClient } from "@/lib/supabase/auth-server";
import { Card } from "@/components/ui/card";
import { UpvoteButton } from "@/components/interview-db/upvote-button";
import { DraftAnswerEditor } from "@/components/interview-db/draft-answer-editor";
import { QUESTION_CATEGORY_LABELS, type QuestionCategory } from "@/lib/constants";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ qid: string }>;
}): Promise<Metadata> {
  await params;
  return { title: "Question — GKS Connect" };
}

export default async function QuestionDetailPage({ params }: { params: Promise<{ qid: string }> }) {
  const { qid } = await params;
  const user = await requireOnboarded(`/interview-db/${qid}`);
  const supabase = await createClient();

  const { data: question } = await supabase
    .from("interview_questions")
    .select("id, text, category, upvotes_count, question_upvotes ( user_id )")
    .eq("id", qid)
    .maybeSingle();

  if (!question) notFound();

  const { data: draft } = await supabase
    .from("draft_answers")
    .select("content")
    .eq("user_id", user.id)
    .eq("question_id", qid)
    .maybeSingle();

  const upvotedByMe = ((question.question_upvotes ?? []) as { user_id: string }[]).some(
    (u) => u.user_id === user.id
  );

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Card>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {QUESTION_CATEGORY_LABELS[question.category as QuestionCategory]}
        </span>
        <div className="mt-1 flex items-start justify-between gap-4">
          <h1 className="text-[18px] font-semibold text-ink">{question.text}</h1>
          <UpvoteButton questionId={question.id} initialCount={question.upvotes_count} initialUpvoted={upvotedByMe} />
        </div>
      </Card>

      <div className="mt-6">
        <p className="text-[13px] font-medium text-ink">Your draft answer</p>
        <p className="mt-1 text-[12.5px] text-muted">
          Private -- only you can see this, and it&apos;s never shown to other applicants.
        </p>
        <div className="mt-2">
          <DraftAnswerEditor questionId={question.id} initialContent={draft?.content ?? ""} />
        </div>
      </div>
    </main>
  );
}
