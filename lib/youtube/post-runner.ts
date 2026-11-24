import "server-only";
import {
  claimForPosting,
  currentDayRange,
  dailyPostLimit,
  postAllowance,
  getQueueRow,
  markApiAccepted,
  markPostFailed,
  recordEvent,
  releaseClaim,
} from "./queue";
import { postRefusal, resolveDraft, type PostRefusal } from "./queue-schema";
import { insertReply, YoutubeApiError } from "./api";
import { YoutubeAuthError } from "./oauth";

/**
 * Sending ONE reply, with every safeguard, in one place.
 *
 * Both the single Post Reply button and the batch runner call this. That is
 * the point: a batch cannot be a weaker path to the same action, because it
 * is not a different path at all. Adding a guard here adds it to both.
 *
 * Nothing in this module reads a request body. The caller supplies a queue row
 * id and the admin's user id; the parent comment id and the reply text are
 * read from the stored row immediately before the call.
 */

export type PostSkipReason = PostRefusal | "not_found" | "already_in_flight" | "daily_limit_reached";

export type PostOutcome =
  /** YouTube accepted the reply. NOT a confirmation that it is live. */
  | { kind: "posted"; id: string; replyId: string; persisted: boolean; audited: boolean }
  /** Refused before anything was sent. Safe: a batch may continue. */
  | { kind: "skipped"; id: string; reason: PostSkipReason }
  /** Sent and clearly rejected. Safe: nothing was created. */
  | { kind: "failed"; id: string; code: string; detail: string }
  /**
   * We do not know whether YouTube created the reply. NOT safe to continue --
   * the row stays claimed as POSTING and a human must look.
   */
  | { kind: "ambiguous"; id: string; code: string; detail: string };

export interface PostContext {
  actorUserId: string;
  /** Reused across a batch so every row is measured against one day window. */
  limit: number;
}

export function newPostContext(actorUserId: string): PostContext {
  return { actorUserId, limit: dailyPostLimit() };
}

/**
 * Posts one approved reply.
 *
 * The order matters and is the whole safety argument:
 *
 *   1. re-read the row from the database -- never trust anything passed in
 *   2. re-check every posting precondition against that fresh row
 *   3. check the day's ceiling, counting in-flight claims
 *   4. claim atomically (APPROVED -> POSTING); losing the race stops here
 *   5. re-check the ceiling excluding this row, releasing the claim if the
 *      window filled in between; nothing has been sent yet, so releasing is
 *      safe and leaves no trace of an attempt that never happened
 *   6. send, exactly once, and never retry
 */
export async function postOneRow(id: string, context: PostContext): Promise<PostOutcome> {
  const row = await getQueueRow(id);
  if (!row) return { kind: "skipped", id, reason: "not_found" };

  const refusal = postRefusal(row);
  if (refusal) return { kind: "skipped", id, reason: refusal };

  const range = currentDayRange();

  // Both ceilings, re-derived from the database for THIS row. The calendar
  // day is what the dashboard shows; the rolling 24 hours is the backstop
  // that stops a midnight reset from allowing a burst across the boundary.
  // The stricter wins, so effectiveRemaining is the only number consulted.
  const before = await postAllowance(0);
  if (before.effectiveRemaining <= 0) {
    return { kind: "skipped", id, reason: "daily_limit_reached" };
  }

  const claimed = await claimForPosting(id);
  if (!claimed) return { kind: "skipped", id, reason: "already_in_flight" };

  // Re-checked with this row excluded, because the claim itself now counts in
  // both windows. If either filled between the check and the claim, hand the
  // slot straight back -- nothing has been sent, so releasing is safe.
  const afterClaim = await postAllowance(0, new Date(), id);
  if (afterClaim.effectiveRemaining <= 0) {
    await releaseClaim(id);
    return { kind: "skipped", id, reason: "daily_limit_reached" };
  }

  await recordEvent({
    queueId: id,
    eventType: "POST_CLAIMED",
    fromStatus: "APPROVED",
    toStatus: "POSTING",
    actorUserId: context.actorUserId,
    metadata: {
      daily_limit: context.limit,
      day_used: afterClaim.dayUsed,
      rolling_used: afterClaim.rollingUsed,
      day: range.day,
    },
  });

  const text = resolveDraft(claimed);

  try {
    const { replyId } = await insertReply(claimed.youtube_comment_id, text);

    const { persisted } = await markApiAccepted({
      id,
      replyId,
      actorUserId: context.actorUserId,
      attemptCount: claimed.attempt_count,
    });

    const audited = await recordEvent({
      queueId: id,
      eventType: "API_ACCEPTED",
      fromStatus: "POSTING",
      toStatus: "API_ACCEPTED",
      actorUserId: context.actorUserId,
      youtubeReplyId: replyId,
      metadata: {
        draft_length: text.length,
        edited: Boolean(claimed.edited_draft),
        promotion_category: claimed.promotion_category,
        day: range.day,
      },
    });

    return { kind: "posted", id, replyId, persisted, audited };
  } catch (error) {
    const isApi = error instanceof YoutubeApiError;
    const isAuth = error instanceof YoutubeAuthError;
    const outcomeUnknown = isApi ? error.outcomeUnknown : false;
    const code = isApi || isAuth ? error.code : "unknown";
    const detail = error instanceof Error ? error.message : "unknown posting error";

    await markPostFailed({
      id,
      actorUserId: context.actorUserId,
      attemptCount: claimed.attempt_count,
      message: detail,
      outcomeUnknown,
    });

    await recordEvent({
      queueId: id,
      eventType: "POST_FAILED",
      fromStatus: "POSTING",
      toStatus: outcomeUnknown ? "POSTING" : "FAILED",
      actorUserId: context.actorUserId,
      metadata: { code, outcome_unknown: outcomeUnknown, day: range.day },
    });

    return outcomeUnknown
      ? { kind: "ambiguous", id, code, detail }
      : { kind: "failed", id, code, detail };
  }
}

export interface BatchReport {
  requested: number;
  posted: number;
  skipped: number;
  failed: number;
  stopped: boolean;
  stoppedReason: "ambiguous_outcome" | "daily_limit_reached" | null;
  outcomes: PostOutcome[];
}

/**
 * Sends a batch, one reply at a time, in order.
 *
 * Strictly sequential -- never Promise.all. Concurrency here would defeat the
 * per-row claim ordering, make the ceiling racy against itself, and fire a
 * burst of replies, which is the exact behaviour this whole feature exists to
 * replace.
 *
 * Stopping strategy, deliberately asymmetric:
 *
 *   - a SKIP or a clear FAILURE means nothing was created, so the batch may
 *     safely move on to the next row
 *   - an AMBIGUOUS outcome means a reply may or may not exist on YouTube, and
 *     the batch STOPS. Continuing would stack a second unknown on top of the
 *     first and make the day's real send count unknowable
 *   - the ceiling being reached also stops the run, since every later row
 *     would be refused anyway
 *
 * There is no retry of any kind. A failed row keeps its FAILED status and
 * needs an explicit re-approval before it can be attempted again.
 */
export type RowPoster = (id: string, context: PostContext) => Promise<PostOutcome>;

export async function postBatch(
  ids: string[],
  context: PostContext,
  // Injected only so the stopping strategy can be tested without a database
  // or a network. Production always uses the real runner above.
  poster: RowPoster = postOneRow
): Promise<BatchReport> {
  const report: BatchReport = {
    requested: ids.length,
    posted: 0,
    skipped: 0,
    failed: 0,
    stopped: false,
    stoppedReason: null,
    outcomes: [],
  };

  for (const id of ids) {
    // Sequential await inside a for-of: one reply at a time, in order.
    const outcome = await poster(id, context);
    report.outcomes.push(outcome);

    if (outcome.kind === "posted") {
      report.posted++;
      continue;
    }
    if (outcome.kind === "failed") {
      report.failed++;
      continue;
    }
    if (outcome.kind === "skipped") {
      report.skipped++;
      if (outcome.reason === "daily_limit_reached") {
        report.stopped = true;
        report.stoppedReason = "daily_limit_reached";
        break;
      }
      continue;
    }

    // ambiguous
    report.failed++;
    report.stopped = true;
    report.stoppedReason = "ambiguous_outcome";
    break;
  }

  return report;
}
