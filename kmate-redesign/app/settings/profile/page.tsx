import { redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Profile editing moved to the profile page itself (inline, own-profile-only
// tabs) -- this route only exists so old links/bookmarks still land
// somewhere real instead of 404ing.
export default async function SettingsProfileRedirect() {
  const user = await requireOnboarded("/settings/profile");
  const { data: profile } = await getSupabaseAdmin().from("profiles").select("username").eq("id", user.id).maybeSingle();
  redirect(profile?.username ? `/profile/${profile.username}` : "/home");
}
