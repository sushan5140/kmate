import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { buildLoginUrl, sanitizeNext } from "@/lib/auth/safe-next";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const metadata: Metadata = {
  title: "Set up your profile — KMate",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Where the user was originally headed before the guard sent them here.
  const destination = sanitizeNext(next);

  const user = await getAuthenticatedUser();
  if (!user) {
    // Keep the destination alive across the sign-in hop as well, so it
    // survives login -> onboarding -> original page.
    redirect(buildLoginUrl(destination === "/home" ? "/onboarding" : `/onboarding?next=${encodeURIComponent(destination)}`));
  }

  const { data: profile } = await getSupabaseAdmin()
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed_at) {
    redirect(destination);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <OnboardingWizard destination={destination} />
    </main>
  );
}
