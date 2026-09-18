import { redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Contact vault moved to the profile page's "Contact vault" tab -- this
// route only exists so old links/bookmarks still land somewhere real
// instead of 404ing.
export default async function SettingsContactsRedirect() {
  const user = await requireOnboarded("/settings/contacts");
  const { data: profile } = await getSupabaseAdmin().from("profiles").select("username").eq("id", user.id).maybeSingle();
  redirect(profile?.username ? `/profile/${profile.username}?tab=contacts` : "/home");
}
