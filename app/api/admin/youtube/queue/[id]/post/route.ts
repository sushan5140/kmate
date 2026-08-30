import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  claimForPosting,
  countRecentPosts,
  dailyPostLimit,
  getQueueRow,
  markApiAccepted,
  markPostFailed,
  recordEvent,
  releaseClaim,
} from "@/lib/youtube/queue";
import { canPost, resolveDraft } from "@/lib/youtube/queue-schema";
import { assertExpectedChannel, insertReply, YoutubeApiError } from "@/lib/youtube/api";
import { YoutubeAuthError } from "@/lib/youtube/oauth";

/**
 * Posts ONE reply, for one queue row, because an admin clicked.
 *
 * There is no bulk endpoint, no post-all, no queue drainer and no cron. This
 * route is the only thing in KMate that writes to YouTube, and it handles
 * exactly one row per request.
 *
 * The request body is empty and is not read. The only input is the row id in
 * the URL; the parent comment id and the reply text are both read from the
 * stored, approved row. A crafted request therefore cannot choose what gets
 * posted or where -- it can only ask for a row that an admin already approved
 * to be sent as approved.
 *
 * On success the row becomes API_ACCEPTED, which is NOT success. YouTube
 * returning a reply id means the call was accepted. The previous bulk run
 * collected 120 such ids and most of the replies were later gone. Only a
 * delayed existence check may promote a row to VERIFIED_LIVE.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Tighter than the other admin routes: this one has an outside effect.
  const rateLimit = checkRateLimit(`youtube-post:${user.id}`, 10, 10 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await params;

  const row = await getQueueRow(id);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Every precondition re-checked against the stored row, immediately before
  // the call: APPROVED, not legacy, not already posted, a top-level comment,
  // automation_action POST, and a non-empty draft.
  if (!canPost(row)) {
    return NextResponse.json(
      { error: "not_postable", status: row.status, is_legacy: row.is_legacy },
      { status: 409 }
    );
  }

  // Safety ceiling. Not an anti-detection measure and not a scheduler: it is
  // an upper bound that makes the previous 60-replies-in-one-run behaviour
  // structurally impossible even if someone clicks sixty times.
  //
  // The count includes rows already claimed and still in flight, so two
  // concurrent posts cannot both read a pre-post total and both proceed.
  const limit = dailyPostLimit();
  const recent = await countRecentPosts(24);
  if (recent >= limit) {
    return NextResponse.json(
      { error: "daily_limit_reached", limit, posted: recent },
      { status: 429 }
    );
  }

  // Confirm the credentials belong to the expected channel before writing
  // anything, so a swapped refresh token cannot post as the wrong account.
  try {
    await assertExpectedChannel();
  } catch (error) {
    const message = error instanceof Error ? error.message : "channel check failed";
    return NextResponse.json({ error: "channel_check_failed", detail: message }, { status: 502 });
  }

  // Atomic claim: APPROVED -> POSTING, returning the row only to the caller
  // that won. A second concurrent click gets nothing back and is refused.
  const claimed = await claimForPosting(id);
  if (!claimed) {
    return NextResponse.json({ error: "already_in_flight" }, { status: 409 });
  }

  // Re-check the ceiling now that the claim is visible to everyone else. The
  // count above and the claim are two statements, and another request could
  // have claimed a different row in between. Excluding this row: if the
  // window is now full, give the slot straight back. Nothing has been sent
  // yet, so releasing is safe, and no POST_CLAIMED event is written for an
  // attempt that never happened.
  const afterClaim = await countRecentPosts(24, id);
  if (afterClaim >= limit) {
    await releaseClaim(id);
    return NextResponse.json(
      { error: "daily_limit_reached", limit, posted: afterClaim },
      { status: 429 }
    );
  }

  await recordEvent({
    queueId: id,
    eventType: "POST_CLAIMED",
    fromStatus: "APPROVED",
    toStatus: "POSTING",
    actorUserId: user.id,
    metadata: { daily_limit: limit, posted_in_window: recent },
  });

  const text = resolveDraft(claimed);
  const parentId = claimed.youtube_comment_id;

  try {
    const { replyId } = await insertReply(parentId, text);

    const { persisted } = await markApiAccepted({
      id,
      replyId,
      actorUserId: user.id,
      attemptCount: claimed.attempt_count,
    });

    const audited = await recordEvent({
      queueId: id,
      eventType: "API_ACCEPTED",
      fromStatus: "POSTING",
      toStatus: "API_ACCEPTED",
      actorUserId: user.id,
      youtubeReplyId: replyId,
      metadata: { draft_length: text.length, edited: Boolean(claimed.edited_draft) },
    });

    return NextResponse.json({
      ok: true,
      status: persisted ? "API_ACCEPTED" : "POSTING",
      reply_id: replyId,
      // Said explicitly so no caller can mistake acceptance for success.
      verified: false,
      persisted,
      audited,
      note: persisted
        ? "YouTube accepted the reply. This is not confirmation that it is live."
        : `The reply WAS created on YouTube but could not be recorded. Save this reply id now — verification needs it: ${replyId}`,
    });
  } catch (error) {
    const isAuth = error instanceof YoutubeAuthError;
    const isApi = error instanceof YoutubeApiError;
    const outcomeUnknown = isApi ? error.outcomeUnknown : false;
    const message = error instanceof Error ? error.message : "unknown posting error";
    const code = isApi ? error.code : isAuth ? error.code : "unknown";

    await markPostFailed({
      id,
      actorUserId: user.id,
      attemptCount: claimed.attempt_count,
      message,
      outcomeUnknown,
    });

    await recordEvent({
      queueId: id,
      eventType: "POST_FAILED",
      fromStatus: "POSTING",
      // An unknown outcome deliberately leaves the row claimed: FAILED is
      // re-approvable, and re-approving a reply that did post would duplicate
      // it. An admin must check YouTube and release the row by hand.
      toStatus: outcomeUnknown ? "POSTING" : "FAILED",
      actorUserId: user.id,
      metadata: { code, outcome_unknown: outcomeUnknown },
    });

    return NextResponse.json(
      {
        error: "post_failed",
        code,
        detail: message,
        outcome_unknown: outcomeUnknown,
        status: outcomeUnknown ? "POSTING" : "FAILED",
      },
      { status: 502 }
    );
  }
}
