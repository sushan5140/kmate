import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded, createClient, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getCachedApprovedQuestions } from "@/lib/cached-content";
import { QuestionBrowser } from "@/components/interview-db/question-browser";
import { SubmitQuestionForm } from "@/components/interview-db/submit-question-form";
import { Card } from "@/components/ui/card";
import type { QuestionCardData } from "@/components/interview-db/question-card";
import { PageHeader } from "@/components/layout/page-header";
import { ArrowRight, Video } from "lucide-react";

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
    <main className="workspace-page mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="Preparation"
        title="Interview Studio"
        description="Turn the question bank into actual preparation: draft your own answers, filter by theme, then rehearse out loud when you are ready."
        meta={
          <div className="flex flex-wrap gap-2 text-[10.5px] font-bold text-muted">
            <span className="border-l-2 border-primary pl-2">{totalApproved} approved questions</span>
            <span className="rounded-[8px] bg-white px-2.5 py-1 ring-1 ring-border">{initialDraftedCount} drafted</span>
          </div>
        }
        actions={<SubmitQuestionForm />}
      />

      <section className="mt-6 grid gap-3 lg:grid-cols-[1fr_.78fr]">
        <Card className="border-l-[3px] border-l-gks-u bg-ink p-6 text-white">
          <p className="text-[12px] font-semibold text-white/48">Prep principle</p>
          <h2 className="mt-2 text-[20px] font-extrabold tracking-[-0.025em]">Prepare ideas, not a memorized script.</h2>
          <p className="mt-3 max-w-2xl text-[12px] font-medium leading-6 text-white/58">
            Expect questions about motivation, academic background, Korea, your study plan, and a few curveballs.
            Keep your answers clear enough to adapt when the interviewer changes the wording.
          </p>
        </Card>

        <Link href="/interview-db/mock-interview" className="block">
          <Card interactive className="h-full border-l-[3px] border-l-primary bg-white">
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary text-white">
                <Video className="h-4.5 w-4.5" />
              </span>
              <ArrowRight className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-5 text-[12px] font-semibold text-primary">AI rehearsal</p>
            <h2 className="mt-1 text-[16px] font-extrabold tracking-[-0.02em] text-ink">Start a mock interview</h2>
            <p className="mt-2 text-[11.5px] font-medium leading-5 text-muted">
              Practice with camera and microphone feedback on delivery mechanics such as pace, filler words, posture, and eye contact.
            </p>
          </Card>
        </Link>
      </section>

      <QuestionBrowser questions={questions} initialDraftedCount={initialDraftedCount} totalApproved={totalApproved} />
    </main>
  );
}
