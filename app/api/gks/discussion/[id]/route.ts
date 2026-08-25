import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { loadDiscussion } from "@/lib/gks/store";

/**
 * Deletes one discussion post: by its author, or by an admin as moderation.
 *
 * Everything the decision rests on is re-read here -- the post row from the
 * database, and the caller's admin status from isAuthorizedAdmin() (the same
 * dual ADMIN_EMAIL + profiles.is_admin gate every other admin route uses).
 * Nothing about ownership, origin or role is taken from the request, so a
 * forged author id or admin flag in the body changes nothing.
 *
 * A post with replies is tombstoned rather than removed: deleting it outright
 * would take the whole conversation underneath it with it (the self-reference
 * cascades). The body is cleared either way, so the words are genuinely gone,
 * while author_id is deliberately preserved -- removing a post must not erase
 * who wrote it.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`gks-delete:${user.id}`, 30, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: post } = await admin
    .from("gks_discussion_posts")
    .select("id, question_id, author_id, deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const isOwner = post.author_id === user.id;
  // Only consulted when the caller isn't the owner, so an admin deleting their
  // own post is recorded as an author deletion, not a moderation action.
  const isAdmin = isOwner ? false : await isAuthorizedAdmin(user);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (post.deleted_at) {
    return NextResponse.json({ error: "already_deleted" }, { status: 409 });
  }

  const { count: replyCount } = await admin
    .from("gks_discussion_posts")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id);

  const hasReplies = Boolean(replyCount && replyCount > 0);
  const deletionType = isOwner ? "author" : "moderator";

  if (hasReplies) {
    await admin
      .from("gks_discussion_posts")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        deletion_type: deletionType,
        body: "",
      })
      .eq("id", id);
    // Votes on removed content shouldn't keep standing behind it.
    await admin.from("gks_discussion_upvotes").delete().eq("post_id", id);
    await admin.from("gks_discussion_posts").update({ upvotes_count: 0 }).eq("id", id);
  } else {
    await admin.from("gks_discussion_posts").delete().eq("id", id);
  }

  const discussion = await loadDiscussion(admin, post.question_id, user.id, isAdmin);
  return NextResponse.json({ discussion, tombstoned: hasReplies, deletionType });
}
