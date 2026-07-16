import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { castQuestionVote } from "@/lib/question-vote";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Shared budget with /upvote -- see that route's comment.
  const rateLimit = checkRateLimit(`vote-question:${user.id}`, 30, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id: questionId } = await params;
  const { voteType } = await castQuestionVote(getSupabaseAdmin(), questionId, user.id, "down");

  return NextResponse.json({ voteType });
}
