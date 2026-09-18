import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ContactType } from "@/lib/constants";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Tighter than a normal moderation action -- this reads private contact
  // details, not a public post.
  const rateLimit = checkRateLimit(`admin-users-contacts:${user.id}`, 30, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id: targetId } = await params;
  const admin = getSupabaseAdmin();

  const [{ data: profile }, { data: contacts, error }] = await Promise.all([
    admin.from("profiles").select("username").eq("id", targetId).maybeSingle(),
    admin.from("contact_methods").select("type, value").eq("user_id", targetId),
  ]);

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  // Viewing another applicant's private contact info is sensitive on its
  // own, independent of any change being made -- audited the same as any
  // other admin action targeting a specific user.
  await admin.from("admin_actions_log").insert({
    action: "admin_view_user_contacts",
    target_user_id: targetId,
    outcome: "success",
    detail: `@${profile?.username ?? targetId} -- viewed by ${user.id}`,
  });

  return NextResponse.json({ contacts: (contacts ?? []) as { type: ContactType; value: string }[] });
}
