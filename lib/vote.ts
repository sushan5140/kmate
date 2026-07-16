import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type VoteType = "up" | "down";

export interface VotesTableConfig {
  /** e.g. "question_upvotes", "eca_upvotes", "mistake_upvotes" */
  table: string;
  /** the column on the votes table referencing the entry, e.g. "question_id", "entry_id" */
  entryColumn: string;
}

// The three votable tables (question_upvotes, eca_upvotes, mistake_upvotes)
// all share the exact same shape: one row per (entry, user), a vote_type
// column, upvotes_count/downvotes_count maintained on the parent table by a
// trigger with identical up/down/switch logic. Generalized here instead of
// copy-pasting castQuestionVote three times -- the only thing that actually
// differs between them is the table name and which column names the entry.
export const QUESTION_VOTES: VotesTableConfig = { table: "question_upvotes", entryColumn: "question_id" };
export const ECA_VOTES: VotesTableConfig = { table: "eca_upvotes", entryColumn: "entry_id" };
export const MISTAKE_VOTES: VotesTableConfig = { table: "mistake_upvotes", entryColumn: "entry_id" };

/**
 * A user can hold at most one vote (up or down) per entry. Clicking the same
 * direction again clears the vote; clicking the other direction moves it.
 * Shared by every upvote/downvote route so the switch-vs-clear logic can't
 * drift between the three tables that use it.
 */
export async function castVote(
  admin: SupabaseClient,
  config: VotesTableConfig,
  entryId: string,
  userId: string,
  direction: VoteType
): Promise<{ voteType: VoteType | null }> {
  const { table, entryColumn } = config;

  const { data: existing } = await admin
    .from(table)
    .select("vote_type")
    .eq(entryColumn, entryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    await admin.from(table).insert({ [entryColumn]: entryId, user_id: userId, vote_type: direction });
    return { voteType: direction };
  }

  if (existing.vote_type === direction) {
    await admin.from(table).delete().eq(entryColumn, entryId).eq("user_id", userId);
    return { voteType: null };
  }

  await admin.from(table).update({ vote_type: direction }).eq(entryColumn, entryId).eq("user_id", userId);
  return { voteType: direction };
}
