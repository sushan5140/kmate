import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { decideRecoveryAttempt } from "@/lib/youtube/recovery-queue";
import { isRecoveryDecisionAction } from "@/lib/youtube/recovery-review";

/**
 * A reviewer's decision on one recovery attempt: approve, hold, or skip.
 *
 * This route does not post. It imports nothing from lib/youtube/api.ts and no
 * verb it accepts can produce POSTING, API_ACCEPTED, VERIFIED_LIVE or REMOVED
 * -- RECOVERY_DECISION_ACTIONS maps only to APPROVED, HOLD and SKIP, and the
 * browser sends a verb rather than a status. Approving marks an attempt as
 * reviewed and ready; sending it would be a separate, explicit action that does
 * not exist yet.
 *
 * The gate is the same one the rest of the YouTube admin uses:
 * getAuthenticatedUser -> isAuthorizedAdmin -> checkRateLimit, with the
 * x-kmate-user-id header that proxy.ts strips from every incoming request
 * before setting it from the verified Supabase session.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rateLimit = checkRateLimit(`youtube-recovery-decide:${user.id}`, 120, 5 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await params;

  let body: { action?: unknown };
  try {
    body = (await request.json()) as { action?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!isRecoveryDecisionAction(body.action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const outcome = await decideRecoveryAttempt(id, body.action, user.id);

  if (!outcome.ok) {
    return NextResponse.json(
      { error: "decision_refused", reason: outcome.reason },
      { status: outcome.httpStatus }
    );
  }

  return NextResponse.json({
    ok: true,
    status: outcome.status,
    // Said explicitly: approving is a review decision, not a send.
    posted: false,
    note:
      outcome.status === "APPROVED"
        ? "Approved for review. Nothing has been sent to YouTube."
        : undefined,
  });
}
