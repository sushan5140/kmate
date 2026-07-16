import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { castVote, ECA_VOTES } from "@/lib/vote";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Shared budget with /downvote -- switching direction back and forth
  // shouldn't double the effective rate limit.
  const rateLimit = checkRateLimit(`vote-eca:${user.id}`, 30, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id: entryId } = await params;
  const { voteType } = await castVote(getSupabaseAdmin(), ECA_VOTES, entryId, user.id, "up");

  return NextResponse.json({ voteType });
}
