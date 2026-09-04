import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeRecoveryRetry } from "@/lib/youtube/recovery-post";
import { RECOVERY_RETRY_REFUSAL_TEXT } from "@/lib/youtube/recovery-retry";

/**
 * Authorizes ONE more attempt on a recovery row that DEFINITELY failed.
 *
 * This route does not send. It returns a FAILED row to APPROVED, and the
 * ordinary send path -- with its own fresh verification and atomic claim --
 * runs afterwards as a separate, explicit act. Splitting them means the
 * decision "this deserves another try" and the act "send it now" are two
 * clicks by a person, not one automatic consequence of the other.
 *
 * Only a definite rejection qualifies. A row whose outcome was UNKNOWN stays
 * in POSTING and is refused here, because retrying an unknown outcome is
 * exactly how a duplicate reply appears under someone's comment. That case
 * goes through /resolve instead, which finds out what actually happened.
 *
 * Same gate as the rest of the YouTube admin.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rateLimit = checkRateLimit(`youtube-recovery-retry:${user.id}`, 10, 5 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await params;

  let body: { confirm?: unknown };
  try {
    body = (await request.json()) as { confirm?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // The verb and the row id are the whole request. No text, no ids, no counts.
  if (body.confirm !== "retry") {
    return NextResponse.json({ error: "confirmation_required" }, { status: 400 });
  }

  const outcome = await authorizeRecoveryRetry(id, user.id);

  if (outcome.ok) {
    return NextResponse.json({
      ok: true,
      status: outcome.status,
      attemptCount: outcome.attemptCount,
      remainingAttempts: outcome.remainingAttempts,
      posted: false,
      note: "One more attempt is authorized. Nothing has been sent — approve-to-send is still a separate action.",
    });
  }

  return NextResponse.json(
    {
      error: "retry_refused",
      reason: outcome.reason,
      message: RECOVERY_RETRY_REFUSAL_TEXT[outcome.reason] ?? outcome.reason,
      posted: false,
    },
    { status: outcome.httpStatus }
  );
}
