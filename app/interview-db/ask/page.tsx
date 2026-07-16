import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded, createClient } from "@/lib/supabase/auth-server";
import { getCachedApprovedQuestions } from "@/lib/cached-content";
import { AskInterviewerList, type AskQuestionData } from "@/components/interview-db/ask-interviewer-list";
import { SubmitQuestionForm } from "@/components/interview-db/submit-question-form";
import { Card } from "@/components/ui/card";
import type { QuestionCategory } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Ask the Interviewer — KMate",
};

interface QuestionRow {
  id: string;
  text: string;
  category: QuestionCategory;
  upvotes_count: number;
  question_upvotes: { user_id: string }[];
}

export default async function AskInterviewerPage() {
  const user = await requireOnboarded("/interview-db/ask");
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();

  let questions: AskQuestionData[];

  if (profile?.is_admin) {
    // See app/interview-db/page.tsx for why admins are left on the
    // original, uncached, fully-RLS-scoped path.
    const { data } = await supabase
      .from("interview_questions")
      .select("id, text, category, upvotes_count, question_upvotes ( user_id )")
      .eq("kind", "interviewer")
      .order("upvotes_count", { ascending: false });
    questions = ((data ?? []) as unknown as QuestionRow[]).map((q) => ({
      id: q.id,
      text: q.text,
      category: q.category,
      upvotesCount: q.upvotes_count,
      upvotedByMe: q.question_upvotes.some((u) => u.user_id === user.id),
    }));
  } else {
    const [cachedApproved, { data: ownPendingRows }, { data: myVoteRows }] = await Promise.all([
      getCachedApprovedQuestions("interviewer"),
      supabase
        .from("interview_questions")
        .select("id, text, category, upvotes_count")
        .eq("kind", "interviewer")
        .eq("submitted_by", user.id)
        .neq("status", "approved"),
      supabase.from("question_upvotes").select("question_id, vote_type").eq("user_id", user.id),
    ]);

    const myUpvotedIds = new Set((myVoteRows ?? []).filter((v) => v.vote_type === "up").map((v) => v.question_id));

    const approved: AskQuestionData[] = cachedApproved.map((q) => ({
      id: q.id,
      text: q.text,
      category: q.category,
      upvotesCount: q.upvotesCount,
      upvotedByMe: myUpvotedIds.has(q.id),
    }));
    const ownPending: AskQuestionData[] = (ownPendingRows ?? []).map((q) => ({
      id: q.id,
      text: q.text,
      category: q.category,
      upvotesCount: q.upvotes_count,
      upvotedByMe: myUpvotedIds.has(q.id),
    }));
    questions = [...approved, ...ownPending];
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/interview-db" className="text-[13px] text-muted hover:text-ink">
        ← Interview DB
      </Link>
      <h1 className="mt-2 text-[22px] font-semibold text-ink">Ask the Interviewer</h1>

      <Card className="mt-4">
        <p className="text-[13.5px] leading-relaxed text-muted">
          Good questions to ask your interviewer at the end -- crowdsourced from other applicants. Prepare
          1-2 of these; it&apos;s a normal, expected part of the interview.
        </p>
      </Card>

      <div className="mt-6 flex justify-end">
        <SubmitQuestionForm kind="interviewer" placeholder="What's a good question to ask an interviewer?" />
      </div>

      <div className="mt-6">
        <AskInterviewerList questions={questions} />
      </div>
    </main>
  );
}
