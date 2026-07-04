import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const metadata: Metadata = {
  title: "Set up your profile — GKS Connect",
};

export default async function OnboardingPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?next=/onboarding");
  }

  const { data: profile } = await getSupabaseAdmin()
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed_at) {
    redirect("/home");
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <OnboardingWizard />
    </main>
  );
}
