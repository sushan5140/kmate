import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { confirmRecoveryReply } from "@/lib/youtube/recovery-post";
import { RECOVERY_CONFIRM_REFUSAL_TEXT } from "@/lib/youtube/recovery-confirm";

/**
 * Checks whether a reply we already sent is STILL LIVE. Read-only.
 *
 * This is the check the whole feature was built around. API_ACCEPTED means
 * YouTube's API returned an id; it does not mean anyone can see the reply. The
 * previous bot's entire false success report came from treating those as the
 * same thing, and asking for the exact reply id later is the only way to tell
 * them apart.
 *
 * Three outcomes: VERIFIED_LIVE (found, right parent, our channel), REMOVED
 * (HTTP 200 with an empty items array — terminal, nothing re-posts it), or
 * inconclusive, which changes no status at all. Not knowing is not a state
 * transition.
 *
 * Same gate as the rest of the YouTube admin.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rateLimit = checkRateLimit(`youtube-recovery-confirm:${user.id}`, 30, 5 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await params;

  let body: { confirm?: unknown };
  try {
    body = (await request.json()) as { confirm?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // The verb and the row id are the whole request. The reply id being checked
  // comes from the row, never from the caller.
  if (body.confirm !== "confirm") {
    return NextResponse.json({ error: "confirmation_required" }, { status: 400 });
  }

  const outcome = await confirmRecoveryReply(id, user.id);

  if (outcome.ok) {
    return NextResponse.json({
      ok: true,
      status: outcome.status,
      detail: outcome.detail,
      changed: outcome.changed,
      posted: false,
      note:
        outcome.status === "VERIFIED_LIVE"
          ? "The reply is live and authored by this channel."
          : "The reply is gone. This is terminal — nothing will re-post it.",
    });
  }

  return NextResponse.json(
    {
      error: "confirm_refused",
      reason: outcome.reason,
      message: RECOVERY_CONFIRM_REFUSAL_TEXT[outcome.reason] ?? outcome.reason,
      detail: outcome.detail,
      posted: false,
    },
    { status: outcome.httpStatus }
  );
}
