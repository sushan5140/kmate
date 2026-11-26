import type { Metadata } from "next";
import { requireOnboarded, createClient } from "@/lib/supabase/auth-server";
import { DisclaimerBanner } from "@/components/apostille/disclaimer-banner";
import { ApostilleTrackToggle } from "@/components/apostille/track-toggle";
import { normalizeIntake } from "@/lib/gks/guideline-editions";

export const metadata: Metadata = { title: "Apostille Guide — KMate" };

export default async function ApostillePage() {
  const user = await requireOnboarded("/apostille");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("track, dual_track_access, application_year").eq("id", user.id).maybeSingle();
  const track = profile?.track === "gks_u" || profile?.track === "gks_g" ? profile.track : null;
  return <main className="mx-auto max-w-3xl px-6 py-10">
    <h1 className="text-[22px] font-semibold text-ink">Documents to Apostille</h1>
    <p className="mt-2 text-[13.5px] leading-relaxed text-muted">Compare source-edition document authentication guidance and country-specific embassy notices. Never pay for authentication based on a different intake's rules.</p>
    <DisclaimerBanner />
    {track ? <ApostilleTrackToggle defaultTrack={track} intake={normalizeIntake(profile?.application_year)} allowToggle={profile?.dual_track_access === true} /> :
      <p className="mt-4 text-[13px] text-muted">Select your GKS program in your profile to see relevant source material.</p>}
  </main>;
}
