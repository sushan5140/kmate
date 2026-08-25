import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { loadDiscussion } from "@/lib/gks/store";

const MAX_POST_LENGTH = 2000;

/** Posts a discussion message, optionally as a reply to an existing one. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`gks-discussion:${user.id}`, 20, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id: questionId } = await params;
  const payload = await request.json().catch(() => null);
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (body.length < 2 || body.length > MAX_POST_LENGTH) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  let parentId: string | null = typeof payload?.parentId === "string" ? payload.parentId : null;

  if (parentId) {
    const { data: parent } = await admin
      .from("gks_discussion_posts")
      .select("id, parent_id, question_id")
      .eq("id", parentId)
      .maybeSingle();

    // A reply must belong to the same question -- otherwise a crafted request
    // could graft a post onto an unrelated thread.
    if (!parent || parent.question_id !== questionId) {
      return NextResponse.json({ error: "invalid_parent" }, { status: 400 });
    }
    // Threads are one level deep: replying to a reply attaches to that
    // reply's root instead of nesting further, so a long back-and-forth
    // stays readable on a phone.
    parentId = parent.parent_id ?? parent.id;
  }

  const { error } = await admin.from("gks_discussion_posts").insert({
    question_id: questionId,
    parent_id: parentId,
    author_id: user.id,
    body,
  });
  if (error) return NextResponse.json({ error: "post_failed" }, { status: 400 });

  const discussion = await loadDiscussion(admin, questionId, user.id);
  return NextResponse.json({ discussion });
}
