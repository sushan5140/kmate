import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { newPostContext, postOneRow } from "@/lib/youtube/post-runner";
import { assertExpectedChannel } from "@/lib/youtube/api";

/**
 * Posts ONE reply, for one queue row, because an admin clicked.
 *
 * The request body is empty and is not read. The only input is the row id in
 * the URL; the parent comment id and the reply text are read from the stored,
 * approved row by the shared runner. A crafted request therefore cannot choose
 * what gets posted or where.
 *
 * All the actual safeguards live in lib/youtube/post-runner.ts, which the
 * batch route also calls. Keeping one implementation is deliberate: a batch
 * must not be able to become a weaker path to the same action.
 *
 * On success the row becomes API_ACCEPTED, which is NOT success. YouTube
 * returning a reply id means the call was accepted; only a delayed existence
 * check may promote a row to VERIFIED_LIVE.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Tighter than the other admin routes: this one has an outside effect.
  const rateLimit = checkRateLimit(`youtube-post:${user.id}`, 10, 10 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await params;

  // Confirm the credentials belong to the expected channel before writing
  // anything. Fails closed when YOUTUBE_CHANNEL_ID is unset.
  try {
    await assertExpectedChannel();
  } catch (error) {
    const message = error instanceof Error ? error.message : "channel check failed";
    return NextResponse.json({ error: "channel_check_failed", detail: message }, { status: 502 });
  }

  const outcome = await postOneRow(id, newPostContext(user.id));

  if (outcome.kind === "skipped") {
    const status =
      outcome.reason === "not_found" ? 404 : outcome.reason === "daily_limit_reached" ? 429 : 409;
    return NextResponse.json({ error: "not_posted", reason: outcome.reason }, { status });
  }

  if (outcome.kind === "failed" || outcome.kind === "ambiguous") {
    return NextResponse.json(
      {
        error: "post_failed",
        code: outcome.code,
        detail: outcome.detail,
        outcome_unknown: outcome.kind === "ambiguous",
        status: outcome.kind === "ambiguous" ? "POSTING" : "FAILED",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    status: outcome.persisted ? "API_ACCEPTED" : "POSTING",
    reply_id: outcome.replyId,
    // Said explicitly so no caller can mistake acceptance for success.
    verified: false,
    persisted: outcome.persisted,
    audited: outcome.audited,
    note: outcome.persisted
      ? "YouTube accepted the reply. This is not confirmation that it is live."
      : `The reply WAS created on YouTube but could not be recorded. Save this reply id now — verification needs it: ${outcome.replyId}`,
  });
}
