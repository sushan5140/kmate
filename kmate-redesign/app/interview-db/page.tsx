import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded, createClient, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getCachedApprovedQuestions } from "@/lib/cached-content";
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
  const supabase = await createClient(); // RLS-respecting, for the personalized queries below

  const isAdmin = await isAuthorizedAdmin(user);

  let questions: QuestionCardData[];
  let draftRowsForCount: { content: string }[];

  if (isAdmin) {
    // Admins see every submission regardless of status/owner on this page
    // today (an RLS side-effect, not a deliberate feature -- there's a
    // dedicated /admin/questions moderation queue for reviewing others'
    // pending content). Left on the original fully-dynamic, uncached path
    // rather than guessing whether that behavior should be preserved
    // through the cache -- admins are a tiny fraction of traffic.
    const [{ data: questionRows }, { data: draftRows }] = await Promise.all([
      supabase
        .from("interview_questions")
        .select("id, text, category, upvotes_count, downvotes_count, status, question_upvotes ( user_id, vote_type )")
        .eq("kind", "interview")
        .order("upvotes_count", { ascending: false }),
      supabase.from("draft_answers").select("question_id, content").eq("user_id", user.id),
    ]);
    const draftsByQuestionId = new Map((draftRows ?? []).map((d) => [d.question_id, d.content]));
    questions = ((questionRows ?? []) as unknown as QuestionRow[]).map((q) => {
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
    draftRowsForCount = draftRows ?? [];
  } else {
    const [cachedApproved, { data: ownPendingRows }, { data: myVoteRows }, { data: draftRows }] = await Promise.all([
      getCachedApprovedQuestions("interview"),
      // This user's own non-approved submissions -- shown inline with a
      // status label, same as before caching (see question-card.tsx).
      supabase
        .from("interview_questions")
        .select("id, text, category, upvotes_count, downvotes_count, status")
        .eq("kind", "interview")
        .eq("submitted_by", user.id)
        .neq("status", "approved"),
      supabase.from("question_upvotes").select("question_id, vote_type").eq("user_id", user.id),
      supabase.from("draft_answers").select("question_id, content").eq("user_id", user.id),
    ]);

    const draftsByQuestionId = new Map((draftRows ?? []).map((d) => [d.question_id, d.content]));
    const myVoteByQuestionId = new Map((myVoteRows ?? []).map((v) => [v.question_id, v.vote_type as "up" | "down"]));

    const approved: QuestionCardData[] = cachedApproved.map((q) => ({
      id: q.id,
      text: q.text,
      category: q.category,
      upvotesCount: q.upvotesCount,
      downvotesCount: q.downvotesCount,
      voteType: myVoteByQuestionId.get(q.id) ?? null,
      status: "approved",
      draftContent: draftsByQuestionId.get(q.id) ?? "",
    }));
    const ownPending: QuestionCardData[] = (ownPendingRows ?? []).map((q) => ({
      id: q.id,
      text: q.text,
      category: q.category,
      upvotesCount: q.upvotes_count,
      downvotesCount: q.downvotes_count,
      voteType: myVoteByQuestionId.get(q.id) ?? null,
      status: q.status,
      draftContent: draftsByQuestionId.get(q.id) ?? "",
    }));
    questions = [...approved, ...ownPending];
    draftRowsForCount = draftRows ?? [];
  }

  const totalApproved = questions.filter((q) => q.status === "approved").length;
  const initialDraftedCount = draftRowsForCount.filter((d) => d.content.trim().length > 0).length;

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

      <Card interactive className="mt-4">
        <Link href="/interview-db/mock-interview" className="block">
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted">New</p>
          <h2 className="mt-1 text-[16px] font-semibold text-ink">Try an AI mock interview</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            Practice out loud with your camera on. Get delivery-mechanics feedback -- eye
            contact, pace, filler words, posture -- never on what you said.
          </p>
        </Link>
      </Card>

      <div className="mt-6 flex items-center justify-end gap-3">
        <SubmitQuestionForm />
      </div>

      <QuestionBrowser questions={questions} initialDraftedCount={initialDraftedCount} totalApproved={totalApproved} />
    </main>
  );
}
