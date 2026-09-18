import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { toggleUpvote, GKS_ANSWER_VOTES } from "@/lib/vote";

/** Toggles the caller's upvote on one GKS community answer. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`gks-vote:${user.id}`, 60, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  const admin = getSupabaseAdmin();

  // Deleted answers are removed outright, so the row is simply gone. Checking
  // first turns a foreign-key violation into an honest 403.
  const { data: answer } = await admin.from("gks_answers").select("id").eq("id", id).maybeSingle();
  if (!answer) return NextResponse.json({ error: "unavailable" }, { status: 403 });

  const { upvoted } = await toggleUpvote(admin, GKS_ANSWER_VOTES, id, user.id);

  return NextResponse.json({ upvoted });
}
