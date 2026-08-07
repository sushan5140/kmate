import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Fires the "add a contact" nag (see components/contacts/contact-wallet-nudge.tsx
// + notifications table's 'contact_wallet_empty' type) once per real sign-in --
// not on every page load -- for an already-onboarded user who still has zero
// contact_methods rows. Best-effort: never blocks or fails the sign-in redirect.
async function maybeNotifyEmptyContactWallet(userId: string) {
  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.onboarding_completed_at) return;

  const { count } = await admin
    .from("contact_methods")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (count) return;

  const { data: existingUnread } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "contact_wallet_empty")
    .is("read_at", null)
    .maybeSingle();
  if (existingUnread) return;

  await admin.from("notifications").insert({ user_id: userId, type: "contact_wallet_empty", payload: {} });
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/home";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data.user) {
        try {
          await maybeNotifyEmptyContactWallet(data.user.id);
        } catch {
          // Best-effort nudge -- a failure here must never block sign-in.
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
