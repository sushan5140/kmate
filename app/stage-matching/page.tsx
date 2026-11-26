import type { Metadata } from "next";
import Link from "next/link";
import { getReviewerGuest, requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { StageMatchingConsent } from "@/components/connections/stage-matching-consent";
import { isMatchCycle, matchPreferenceActive, type MatchChoice, type MatchPreference } from "@/lib/connections/stage-matching";

export const metadata: Metadata = { title: "Stage matching — KMate" };
type Match = { username: string; university_name: string };
export default async function StageMatchingPage() {
  const user = await requireOnboarded("/stage-matching");
  const guest = await getReviewerGuest();
  const enabled = process.env.KMATE_STAGE_MATCHING_ENABLED === "true";
  let choices: MatchChoice[] = [], preference: MatchPreference | null = null, matches: Match[] = [];
  let available = false, matchesAvailable = false, canMatch = false;
  if (!guest && enabled) {
    const admin = getSupabaseAdmin();
    const [profile, choiceRows, own] = await Promise.all([
      admin.from("profiles").select("track, application_year, onboarding_completed_at, deleted_at, username").eq("id", user.id).maybeSingle(),
      admin.from("university_choices").select("id, university:universities(name)").eq("user_id", user.id),
      admin.from("stage_matching_preferences").select("choice_id,stage,expires_at,consented_at,program,cycle,profile_version").eq("user_id", user.id).maybeSingle(),
    ]);
    available = !profile.error && !choiceRows.error && !own.error;
    if (available) {
      const p = profile.data;
      const rows = (choiceRows.data ?? []) as unknown as {id: string; university: {name: string} | null}[];
      choices = rows.flatMap(row => row.university ? [{id: row.id, name: row.university.name}] : []);
      preference = own.data as MatchPreference | null;
      canMatch = Boolean(p?.username && !p.deleted_at && p.onboarding_completed_at && isMatchCycle(p.application_year) && ["gks_u","gks_g"].includes(p.track));
      if (canMatch && p && own.data && matchPreferenceActive(preference, choices, Date.now()) &&
        own.data.program === p.track && own.data.cycle === p.application_year && own.data.profile_version === p.onboarding_completed_at) {
        const result = await admin.rpc("find_stage_matches", { p_user_id: user.id });
        matchesAvailable = !result.error;
        if (matchesAvailable) matches = (result.data ?? []) as Match[];
      }
    }
  }
  return <main className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-6">
    <Link href="/requests?tab=discover" className="text-[13px] font-medium text-primary underline">Back to Connections</Link>
    <h1 className="text-[24px] font-semibold text-ink">Stage-based applicant matching</h1>
    <p className="text-[13.5px] leading-relaxed text-muted">Find peers who have independently chosen to share a broad application stage. Matching is not evidence of admission or scholarship eligibility.</p>
    {guest ? <p className="rounded-xl bg-canvas p-4 text-[13px] text-muted">Sign in to participate. Guests cannot view matching participants.</p> :
      !enabled ? <p className="rounded-xl bg-canvas p-4 text-[13px] text-muted">Matching pilot is not enabled. No participant data is shown.</p> :
      !available ? <p role="alert" className="rounded-xl bg-canvas p-4 text-[13px] text-muted">Matching is unavailable. No data was disclosed.</p> :
      <>
        <StageMatchingConsent key={preference?.consented_at ?? "none"} choices={canMatch ? choices : []} preference={preference} enabled={canMatch} />
        <section className="rounded-2xl border border-hairline bg-white p-4">
          <h2 className="text-[17px] font-semibold text-ink">Matching applicants</h2>
          {!matchesAvailable ? <p className="mt-2 text-[13px] text-muted">A current, valid opt-in and available matching service are required. No matches are displayed.</p> :
            matches.length === 0 ? <p className="mt-2 text-[13px] text-muted">No opted-in applicants match your current choice and stage yet.</p> :
            <ul className="mt-3 space-y-2">{matches.map(m => <li key={m.username} className="rounded-xl bg-canvas p-3"><Link href={"/profile/" + encodeURIComponent(m.username)} className="font-semibold text-primary underline">@{m.username}</Link><p className="text-[12px] text-muted">{m.university_name} · self-reported match</p></li>)}</ul>}
        </section>
      </>}
  </main>;
}
