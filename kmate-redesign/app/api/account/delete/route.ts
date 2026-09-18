import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Soft-delete per PRD Decision #1: don't hard-delete auth.users/profiles --
 * null out username/bio/etc (freeing the username immediately, since the
 * uniqueness index is partial on "where username is not null") and clear
 * onboarding_completed_at so a future sign-in goes straight back through
 * onboarding, as if fresh.
 */
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Destructive and rare -- almost no legitimate reason to call this more
  // than once. A tight cap mainly protects against a hijacked session token
  // or a client bug hammering this, not normal user behavior.
  const rateLimit = checkRateLimit(`account-delete:${user.id}`, 3, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const admin = getSupabaseAdmin();

  await admin.from("university_choices").delete().eq("user_id", user.id);
  await admin.from("contact_methods").delete().eq("user_id", user.id);
  await admin.from("draft_answers").delete().eq("user_id", user.id);
  await admin
    .from("connection_requests")
    .update({ status: "revoked", responded_at: new Date().toISOString() })
    .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
    .eq("status", "accepted");

  const { error } = await admin
    .from("profiles")
    .update({
      username: null,
      bio: null,
      avatar_url: null,
      track: null,
      gks_u_embassy_path: null,
      major: null,
      application_year: null,
      onboarding_completed_at: null,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
