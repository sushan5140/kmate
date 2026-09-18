import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { loadAnswers } from "@/lib/gks/store";

/**
 * Deletes one community answer: by its author, or by an admin as moderation.
 *
 * `origin = 'kmate_user'` is checked first and applies to admins too. Imported
 * corpus answers have no author to hold responsible, so they are not user
 * content and this endpoint will not touch them for anyone -- pruning them is
 * retrieval's job (see syncCommunityAnswers), not a moderator's. Official
 * guideline text isn't stored in this table at all, so it is unreachable here
 * by construction.
 *
 * Both the row and the caller's admin status are re-read server-side; the
 * request never supplies an author id, an origin or a role.
 *
 * The delete is unconditional rather than soft: an answer has no replies
 * hanging off it, so there is no thread to keep intact, and "deleted" should
 * mean the text is gone. Upvote rows cascade with it.
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

  const { data: answer } = await admin
    .from("gks_answers")
    .select("id, question_id, origin, author_id")
    .eq("id", id)
    .maybeSingle();

  // Same 403 for "doesn't exist" and "imported" -- the caller learns nothing
  // about rows they have no business acting on.
  if (!answer || answer.origin !== "kmate_user") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const isOwner = answer.author_id === user.id;
  const isAdmin = isOwner ? false : await isAuthorizedAdmin(user);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await admin.from("gks_answers").delete().eq("id", id).eq("origin", "kmate_user");

  const answers = await loadAnswers(admin, answer.question_id, user.id, undefined, isAdmin);
  return NextResponse.json({ answers, moderated: !isOwner });
}
