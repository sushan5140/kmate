import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

interface WarnBody {
  reason: string;
}

// The simplest version of "send an in-app notice" this app already has the
// pieces for: the notifications table + its existing GET (list) and POST
// (mark-read) routes, neither of which anything actually called before now.
// A small banner on /home (components/notifications/warning-banner.tsx)
// polls the same GET route, filters for unread admin_warning rows, and
// dismisses via the same mark-read POST -- no new messaging system.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rateLimit = checkRateLimit(`admin-users-warn:${user.id}`, 20, 5 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id: targetId } = await params;
  const body = (await request.json()) as WarnBody;
  const reason = body.reason?.trim();
  if (!reason || reason.length > 280) {
    return NextResponse.json({ error: "invalid_reason" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: targetProfile } = await admin.from("profiles").select("username").eq("id", targetId).maybeSingle();
  if (!targetProfile) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const { error } = await admin.from("notifications").insert({
    user_id: targetId,
    type: "admin_warning",
    payload: { reason, warnedBy: user.id },
  });
  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  await admin.from("admin_actions_log").insert({
    action: "admin_warn_user",
    target_user_id: targetId,
    outcome: "success",
    detail: `@${targetProfile.username ?? targetId} -- warned by ${user.id}: ${reason}`,
  });

  return NextResponse.json({ ok: true });
}
