import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { RecoveryCategory, RecoveryLegacyOutcome, RecoveryStatus } from "./recovery";
import {
  RECOVERY_DECISION_ACTIONS,
  recoveryDecisionRefusal,
  type RecoveryDecisionAction,
} from "./recovery-review";

/**
 * Reads and decisions for public.youtube_reply_recovery_attempts.
 *
 * A recovery attempt is a SEPARATE child record, never a reopened queue row.
 * Nothing in this module touches public.youtube_reply_queue -- it is read once,
 * read-only, to look up the parent comment's original text for display, and is
 * never written to. The original queue's REMOVED rows, final drafts and posted
 * reply ids stay exactly as they are.
 *
 * Nothing here posts. There is no insert path, no YouTube call, and no verb
 * that can produce a posted status.
 */

/** Explicit column list -- no select("*"). */
const RECOVERY_COLUMNS = `
  id, queue_id, youtube_comment_id, legacy_reply_id, legacy_draft_text,
  legacy_outcome, legacy_evidence, recovery_set, author_name,
  recovery_batch, recovery_order, category, draft_text, status,
  decided_by, decided_at, posted_reply_id, api_accepted_at,
  verified_at, removed_detected_at, last_verified_at,
  attempt_count, last_attempt_at, last_error, created_at, updated_at
`;

export interface RecoveryAttemptRow {
  id: string;
  queue_id: string | null;
  youtube_comment_id: string;
  legacy_reply_id: string;
  legacy_draft_text: string | null;
  legacy_outcome: RecoveryLegacyOutcome;
  legacy_evidence: Record<string, unknown> | null;
  recovery_set: string;
  author_name: string;
  recovery_batch: number;
  recovery_order: number;
  category: RecoveryCategory;
  draft_text: string;
  status: RecoveryStatus;
  decided_by: string | null;
  decided_at: string | null;
  posted_reply_id: string | null;
  api_accepted_at: string | null;
  verified_at: string | null;
  removed_detected_at: string | null;
  last_verified_at: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** A row plus the parent comment text, when the original queue still holds it. */
export interface RecoveryAttemptView extends RecoveryAttemptRow {
  parent_comment_text: string | null;
  parent_video_title: string | null;
  parent_source_url: string | null;
}

export async function getRecoveryAttempt(id: string): Promise<RecoveryAttemptRow | null> {
  const { data } = await getSupabaseAdmin()
    .from("youtube_reply_recovery_attempts")
    .select(RECOVERY_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  return (data as RecoveryAttemptRow | null) ?? null;
}

/**
 * Every recovery attempt, in review order, with parent context where available.
 *
 * The parent comment's original text is looked up from the existing
 * youtube_reply_queue by youtube_comment_id -- a plain read of data already
 * stored. No YouTube API call is made to render this page: a per-row live fetch
 * would turn opening the admin screen into dozens of quota calls, and the
 * reviewer's decision does not depend on re-fetching a comment we already have.
 * When the parent is not in the queue (the old bot's history predates it), the
 * text is simply reported as unavailable rather than invented.
 */
export async function listRecoveryAttempts(): Promise<RecoveryAttemptView[]> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("youtube_reply_recovery_attempts")
    .select(RECOVERY_COLUMNS)
    .order("recovery_batch", { ascending: true })
    .order("recovery_order", { ascending: true });

  // Surfaced, not swallowed: an unmigrated environment must say so rather than
  // render an empty review list that looks like "no work to do".
  if (error) throw new Error(`recovery attempts read failed: ${error.message}`);

  const rows = (data ?? []) as RecoveryAttemptRow[];
  if (rows.length === 0) return [];

  const parentIds = [...new Set(rows.map((r) => r.youtube_comment_id))];
  const { data: parents } = await admin
    .from("youtube_reply_queue")
    .select("youtube_comment_id, original_text, video_title, source_url")
    .in("youtube_comment_id", parentIds);

  const byComment = new Map(
    ((parents ?? []) as Array<{
      youtube_comment_id: string;
      original_text: string | null;
      video_title: string | null;
      source_url: string | null;
    }>).map((p) => [p.youtube_comment_id, p])
  );

  return rows.map((row) => {
    const parent = byComment.get(row.youtube_comment_id);
    return {
      ...row,
      parent_comment_text: parent?.original_text ?? null,
      parent_video_title: parent?.video_title ?? null,
      parent_source_url: parent?.source_url ?? null,
    };
  });
}

export interface RecoveryCounts {
  total: number;
  byStatus: Record<string, number>;
  byLegacyOutcome: Record<string, number>;
  decided: number;
  posted: number;
}

export async function countRecoveryAttempts(): Promise<RecoveryCounts> {
  const { data } = await getSupabaseAdmin()
    .from("youtube_reply_recovery_attempts")
    .select("status, legacy_outcome, decided_at, posted_reply_id");

  const rows = (data ?? []) as Array<{
    status: string;
    legacy_outcome: string;
    decided_at: string | null;
    posted_reply_id: string | null;
  }>;

  const byStatus: Record<string, number> = {};
  const byLegacyOutcome: Record<string, number> = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    byLegacyOutcome[row.legacy_outcome] = (byLegacyOutcome[row.legacy_outcome] ?? 0) + 1;
  }

  return {
    total: rows.length,
    byStatus,
    byLegacyOutcome,
    decided: rows.filter((r) => r.decided_at !== null).length,
    posted: rows.filter((r) => r.posted_reply_id !== null).length,
  };
}

export type RecoveryDecisionOutcome =
  | { ok: true; status: RecoveryStatus }
  | { ok: false; reason: string; httpStatus: number };

/**
 * Applies one reviewer verb to one attempt.
 *
 * What this deliberately does NOT write: legacy_reply_id, legacy_outcome,
 * legacy_evidence, legacy_draft_text, recovery_set, recovery_batch,
 * recovery_order, category or draft_text. The legacy provenance -- including
 * the exact-id verification evidence and the channel it was checked against --
 * is historical fact and a review decision has no business editing it. Only
 * status, decided_by, decided_at and updated_at move.
 *
 * The update is conditional on the status the eligibility check was made
 * against, so two reviewers acting at once cannot both apply a decision to the
 * same row from different starting states.
 *
 * `unhold` returns a held attempt to DRAFTED and CLEARS the decision stamp,
 * matching how the notice review queue handles a reversed decision: a row back
 * in the undecided state must not carry a stale "decided by" from a decision
 * that no longer stands. The trade-off is deliberate -- who held the row is not
 * retained, because this table has no event log and inventing one is not part
 * of this change. `updated_at` still moves, so the reversal is visible.
 */
export async function decideRecoveryAttempt(
  id: string,
  action: RecoveryDecisionAction,
  actorUserId: string
): Promise<RecoveryDecisionOutcome> {
  const row = await getRecoveryAttempt(id);
  if (!row) return { ok: false, reason: "not_found", httpStatus: 404 };

  const refusal = recoveryDecisionRefusal(action, row);
  if (refusal) return { ok: false, reason: refusal, httpStatus: 409 };

  const target = RECOVERY_DECISION_ACTIONS[action];
  const now = new Date().toISOString();
  // Returning to the undecided state clears the stamp; every other verb sets it.
  const reverting = action === "unhold";

  const { data, error } = await getSupabaseAdmin()
    .from("youtube_reply_recovery_attempts")
    .update({
      status: target,
      decided_by: reverting ? null : actorUserId,
      decided_at: reverting ? null : now,
      updated_at: now,
    })
    .eq("id", id)
    // Guard against a concurrent decision: the row must still be in the state
    // the eligibility check just approved.
    .eq("status", row.status)
    .select("id, status")
    .maybeSingle();

  if (error) {
    // 23505 = the one-active-attempt-per-parent unique index. Reported rather
    // than worked around: that constraint is the protection against two live
    // recovery attempts existing for the same comment.
    if (error.code === "23505") {
      return { ok: false, reason: "parent_already_active", httpStatus: 409 };
    }
    // 23514 = a CHECK constraint, e.g. approving without confirmed removal.
    if (error.code === "23514") {
      return { ok: false, reason: "database_refused", httpStatus: 409 };
    }
    return { ok: false, reason: "server_error", httpStatus: 500 };
  }

  if (!data) return { ok: false, reason: "conflict", httpStatus: 409 };
  return { ok: true, status: target };
}
