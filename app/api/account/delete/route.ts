import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Legacy route name retained for existing clients.
 * This is a PROFILE RESET, not a complete account deletion:
 * auth.users and historical community/conversation data remain.
 * The UI and privacy page must not call it full account erasure.
 *
 * These are multiple database operations, not a single transaction.
 * Check each response and fail visibly instead of claiming success after
 * a partial error. An error can still mean earlier steps were applied.
 */
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`account-delete:${user.id}`, 3, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const admin = getSupabaseAdmin();
  const failed = () => NextResponse.json({ error: "reset_incomplete" }, { status: 500 });

  const universityResult = await admin.from("university_choices").delete().eq("user_id", user.id);
  if (universityResult.error) return failed();

  const contactResult = await admin.from("contact_methods").delete().eq("user_id", user.id);
  if (contactResult.error) return failed();

  const draftResult = await admin.from("draft_answers").delete().eq("user_id", user.id);
  if (draftResult.error) return failed();

  const connectionResult = await admin
    .from("connection_requests")
    .update({ status: "revoked", responded_at: new Date().toISOString() })
    .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
    .eq("status", "accepted");
  if (connectionResult.error) return failed();

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

  if (error) return failed();
  return NextResponse.json({ ok: true, operation: "profile_reset" });
}
