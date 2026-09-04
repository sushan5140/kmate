import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendRecoveryAttempt } from "@/lib/youtube/recovery-post";
import { RECOVERY_SEND_REFUSAL_TEXT } from "@/lib/youtube/recovery-send";

/**
 * Sends ONE approved recovery attempt to YouTube. One admin, one click, one row.
 *
 * The request body carries a confirmation verb and nothing else. There is no
 * parameter for the reply text, the parent comment, the legacy reply id, the
 * category or the target video -- the server reads every one of those from the
 * approved row after authorization, so a crafted request cannot change what
 * gets posted, only whether an already-approved row is sent.
 *
 * Before anything is sent, a FRESH exact-id check runs against YouTube. The
 * verification stored on the row is provenance: it records that the legacy
 * reply was gone when it was checked, not that it is gone now. Only a live
 * check taken immediately before the claim can say that.
 *
 * The gate is the same one the rest of the YouTube admin uses:
 * getAuthenticatedUser -> isAuthorizedAdmin -> checkRateLimit, with the
 * x-kmate-user-id header that proxy.ts strips from every incoming request
 * before setting it from the verified Supabase session.
 *
 * There is no cron and no queue drainer pointed at this route, and there must
 * not be one. Unattended posting is the failure this whole feature exists to
 * undo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Tighter than the decide route: sending is irreversible, so the ceiling is
  // low enough that a stuck client cannot walk the whole recovery set.
  const rateLimit = checkRateLimit(`youtube-recovery-send:${user.id}`, 10, 5 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await params;

  let body: { confirm?: unknown };
  try {
    body = (await request.json()) as { confirm?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // An explicit verb, so a bare or replayed POST cannot send anything. Note
  // what is NOT read from the body: text, parentId, legacyReplyId, category,
  // videoId. Those are not optional-with-defaults here, they are absent.
  if (body.confirm !== "send") {
    return NextResponse.json({ error: "confirmation_required" }, { status: 400 });
  }

  const outcome = await sendRecoveryAttempt(id, user.id);

  if (outcome.ok) {
    return NextResponse.json({
      ok: true,
      status: outcome.status,
      postedReplyId: outcome.postedReplyId,
      // Said explicitly: the API accepted it. That is not the same as live,
      // and this feature exists because those two were once confused.
      note: "YouTube accepted the reply. Accepted is not the same as live — verify before treating it as posted.",
    });
  }

  return NextResponse.json(
    {
      error: outcome.reason === "send_failed" ? "send_failed" : "send_refused",
      reason: outcome.reason,
      message: RECOVERY_SEND_REFUSAL_TEXT[outcome.reason] ?? outcome.reason,
      posted: false,
      ...(outcome.reason === "send_failed"
        ? {
            disposition: outcome.disposition,
            status: outcome.status,
            // The unknown case needs a person, and the response should say so
            // rather than looking like an ordinary failure a client may retry.
            needsHumanReview: outcome.disposition === "outcome_unknown",
          }
        : {}),
    },
    { status: outcome.httpStatus }
  );
}
