import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveStuckRecoverySend } from "@/lib/youtube/recovery-post";
import { RECOVERY_RESOLVE_REFUSAL_TEXT } from "@/lib/youtube/recovery-resolve";

/**
 * Investigates ONE recovery attempt stuck in POSTING. Read-only against YouTube.
 *
 * A row is stuck when a send was claimed but the outcome is unknown: the
 * request died in flight, YouTube accepted without returning a usable id, or
 * the process stopped between the insert and the write-back. The reply may or
 * may not exist, and this route finds out rather than guessing.
 *
 * It CANNOT post. No insert is reachable from here -- the resolver lists the
 * replies under the stored parent comment and judges them. It concludes "this
 * posted" only on a single reply that is under the expected parent, authored by
 * the expected channel, whose text equals the approved draft byte for byte, and
 * published in a window consistent with the attempt. Zero matches, several
 * matches, an API error or an unreadable response all leave the row exactly
 * where it was, blocked, for a person to look at.
 *
 * Same gate as the rest of the YouTube admin: getAuthenticatedUser ->
 * isAuthorizedAdmin -> checkRateLimit.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rateLimit = checkRateLimit(`youtube-recovery-resolve:${user.id}`, 20, 5 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await params;

  let body: { confirm?: unknown };
  try {
    body = (await request.json()) as { confirm?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Nothing else is read from the body. The parent comment, the draft text and
  // the expected channel all come from the row and from pinned constants.
  if (body.confirm !== "resolve") {
    return NextResponse.json({ error: "confirmation_required" }, { status: 400 });
  }

  const outcome = await resolveStuckRecoverySend(id, user.id);

  if (outcome.ok) {
    return NextResponse.json({
      ok: true,
      status: outcome.status,
      postedReplyId: outcome.postedReplyId,
      apiAcceptedAt: outcome.apiAcceptedAt,
      posted: false,
      note: "An existing reply was positively identified. Nothing was sent — this recorded what was already there.",
    });
  }

  return NextResponse.json(
    {
      error: "resolve_refused",
      reason: outcome.reason,
      message: RECOVERY_RESOLVE_REFUSAL_TEXT[outcome.reason] ?? outcome.reason,
      posted: false,
      needsHumanReview: outcome.reason === "no_match" || outcome.reason === "multiple_matches",
      // What was examined, so the admin can carry on from where this stopped.
      judgements: outcome.judgements,
    },
    { status: outcome.httpStatus }
  );
}
