import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { toggleUpvote, GKS_DISCUSSION_VOTES } from "@/lib/vote";

/** Toggles the caller's upvote on one GKS discussion post. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Shared budget with answer voting would be wrong here (they're different
  // actions on different objects), but the ceiling is the same: high enough
  // that nobody browsing hits it, low enough to stop a script.
  const rateLimit = checkRateLimit(`gks-discussion-vote:${user.id}`, 60, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  const admin = getSupabaseAdmin();

  // A tombstoned post has no body left to endorse, so it must not accumulate
  // votes -- and a vote cast on removed content would sit under a "removed"
  // notice looking like approval of something nobody can read.
  const { data: post } = await admin
    .from("gks_discussion_posts")
    .select("id, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!post || post.deleted_at) {
    return NextResponse.json({ error: "unavailable" }, { status: 403 });
  }

  const { upvoted } = await toggleUpvote(admin, GKS_DISCUSSION_VOTES, id, user.id);

  return NextResponse.json({ upvoted });
}
