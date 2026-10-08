import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getQueueRow, minVerifyAgeHours, recordEvent } from "@/lib/youtube/queue";
import { verifyRefusal } from "@/lib/youtube/queue-schema";
import { replyExists, YoutubeApiError } from "@/lib/youtube/api";
import { YoutubeAuthError } from "@/lib/youtube/oauth";

/**
 * Asks YouTube whether one specific reply still exists.
 *
 * Read-only against YouTube: it queries the exact reply id that was stored
 * when the post was accepted. That direct-id query is what finally told the
 * truth about the previous bulk run -- an empty result means the reply is
 * gone, however confidently the original insert reported success.
 *
 * Two guards define this route:
 *
 *   - A reply younger than YOUTUBE_MIN_VERIFY_AGE_HOURS (24 by default) is
 *     refused with too_early. The old bot checked after five seconds, always
 *     found the reply, and printed "VERIFIED LIVE" for replies that did not
 *     survive. Checking immediately does not measure survival.
 *   - Not-found sets REMOVED, which is terminal. Nothing reposts it.
 *
 * Admin-triggered only. There is no verification cron in V1.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rateLimit = checkRateLimit(`youtube-verify:${user.id}`, 60, 10 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await params;
  const row = await getQueueRow(id);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const minAgeHours = minVerifyAgeHours();
  const refusal = verifyRefusal(row, new Date(), minAgeHours);
  if (refusal) {
    return NextResponse.json(
      { error: "cannot_verify", reason: refusal, min_age_hours: minAgeHours },
      { status: 409 }
    );
  }

  const replyId = row.posted_reply_id!;

  let found: boolean;
  try {
    ({ found } = await replyExists(replyId));
  } catch (error) {
    const code =
      error instanceof YoutubeApiError || error instanceof YoutubeAuthError ? error.code : "unknown";
    const detail = error instanceof Error ? error.message : "verification failed";
    // A failed check is not evidence of removal. The row keeps its status.
    return NextResponse.json({ error: "verify_failed", code, detail }, { status: 502 });
  }

  const now = new Date().toISOString();
  const admin = getSupabaseAdmin();

  if (found) {
    await admin
      .from("youtube_reply_queue")
      .update({
        status: "VERIFIED_LIVE",
        // verified_at records the FIRST confirmation; last_verified_at moves
        // on every check, so a row shows both when it was confirmed and how
        // recently that was still true.
        verified_at: row.verified_at ?? now,
        last_verified_at: now,
        updated_at: now,
      })
      .eq("id", id);

    await recordEvent({
      queueId: id,
      eventType: "VERIFY_FOUND",
      fromStatus: row.status,
      toStatus: "VERIFIED_LIVE",
      actorUserId: user.id,
      youtubeReplyId: replyId,
      metadata: { rechecked: row.status === "VERIFIED_LIVE" },
    });

    return NextResponse.json({ ok: true, status: "VERIFIED_LIVE", found: true });
  }

  await admin
    .from("youtube_reply_queue")
    .update({
      status: "REMOVED",
      removed_detected_at: now,
      last_verified_at: now,
      updated_at: now,
    })
    .eq("id", id);

  // Two events: what the check saw, then the state it produced. The pair
  // keeps a reply that was once VERIFIED_LIVE and later removed legible in
  // the audit trail rather than collapsing into a single ambiguous row.
  await recordEvent({
    queueId: id,
    eventType: "VERIFY_NOT_FOUND",
    fromStatus: row.status,
    toStatus: "REMOVED",
    actorUserId: user.id,
    youtubeReplyId: replyId,
    metadata: { was_verified_live: row.status === "VERIFIED_LIVE", is_legacy: row.is_legacy },
  });
  await recordEvent({
    queueId: id,
    eventType: "REMOVED",
    fromStatus: row.status,
    toStatus: "REMOVED",
    actorUserId: user.id,
    youtubeReplyId: replyId,
    metadata: { terminal: true },
  });

  return NextResponse.json({ ok: true, status: "REMOVED", found: false });
}
