import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Records a reviewer's decision on one queued official notice.
 *
 * What approval means here, precisely: a human has confirmed the notice's
 * classified metadata is right. It does NOT publish anything. It does not
 * touch data/deadlines-notices-data.json, which is source-controlled and
 * changes only through a reviewed commit, and it does not create a verified
 * deadline from any extracted candidate date. The only thing that moves is
 * this row's status column.
 *
 * "pending" is offered as an explicit third action so a reviewer can undo a
 * decision -- returning an item to the queue rather than being stuck with a
 * hasty approve.
 */
const ACTIONS = { approve: "approved", reject: "rejected", pending: "pending_review" } as const;
type Action = keyof typeof ACTIONS;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Same tighter budget as the other admin moderation routes.
  const rateLimit = checkRateLimit(`moderate-notice-queue:${user.id}`, 60, 5 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await params;

  let action: Action;
  try {
    ({ action } = (await request.json()) as { action: Action });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const status = ACTIONS[action];
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("notice_review_queue")
    .update({
      status,
      // Returning an item to the queue clears the review stamp, so a pending
      // row never carries a stale "reviewed by" from a reversed decision.
      reviewed_at: status === "pending_review" ? null : new Date().toISOString(),
      reviewed_by: status === "pending_review" ? null : user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, status });
}
