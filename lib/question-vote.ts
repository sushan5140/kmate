import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type VoteType = "up" | "down";

/**
 * A user can hold at most one vote (up or down) per question. Clicking the
 * same direction again clears the vote; clicking the other direction moves
 * it. Shared by the upvote and downvote routes so the switch-vs-clear logic
 * can't drift between them.
 */
export async function castQuestionVote(
  admin: SupabaseClient,
  questionId: string,
  userId: string,
  direction: VoteType
): Promise<{ voteType: VoteType | null }> {
  const { data: existing } = await admin
    .from("question_upvotes")
    .select("vote_type")
    .eq("question_id", questionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    await admin.from("question_upvotes").insert({ question_id: questionId, user_id: userId, vote_type: direction });
    return { voteType: direction };
  }

  if (existing.vote_type === direction) {
    await admin.from("question_upvotes").delete().eq("question_id", questionId).eq("user_id", userId);
    return { voteType: null };
  }

  await admin
    .from("question_upvotes")
    .update({ vote_type: direction })
    .eq("question_id", questionId)
    .eq("user_id", userId);
  return { voteType: direction };
}
