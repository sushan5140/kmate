import type { Metadata } from "next";
import { requireOnboarded, createClient } from "@/lib/supabase/auth-server";
import { Card } from "@/components/ui/card";
import { DisclaimerBanner } from "@/components/apostille/disclaimer-banner";
import { GeneralDefaultSection } from "@/components/apostille/general-default-section";
import { ApostilleTrackToggle } from "@/components/apostille/track-toggle";
import { CountryOverrideCard } from "@/components/apostille/country-override-card";
import { GuidelineRuleActions } from "@/components/official-guidelines/guideline-rule-actions";
import { GKS_U_2027_SOURCE } from "@/lib/gks/guidelines-2027";
import { APOSTILLE_GENERAL_DEFAULT, APOSTILLE_COUNTRY_OVERRIDES } from "@/lib/apostille-requirements";
import { TRACK_LABELS, type Track } from "@/lib/constants";
import { PageHeader } from "@/components/layout/page-header";
import { isDemoUserId } from "@/lib/demo-mode";

export const metadata: Metadata = {
  title: "Apostille Guide — KMate",
};

export default async function ApostillePage() {
  const user = await requireOnboarded("/apostille");
  const supabase = await createClient();
  const demoMode = isDemoUserId(user.id);
  // Scoped to the user's own track -- onboarding requires picking one before
  // onboarding_completed_at is ever set, so requireOnboarded() already
  // guarantees this is present. dual_track_access is an admin-granted
  // override (see /admin/users) for selected applicants who legitimately
  // need both tracks' requirements -- everyone else stays hard-scoped to
  // their own. Same precedent as Scholar Stats.
  const { data: profile } = await supabase
    .from("profiles")
    .select("track, dual_track_access")
    .eq("id", user.id)
    .maybeSingle();
  const track = demoMode ? "gks_u" : ((profile?.track as Track | null) ?? "gks_g");
  const dualTrackAccess = demoMode || (profile?.dual_track_access ?? false);
  const expectedCycle = track === "gks_u" ? "2027" : "2026";
  const currentOverrides = APOSTILLE_COUNTRY_OVERRIDES.filter(
    (item) => item.verifiedCycleByTrack[track] === expectedCycle
  );
  const previousOverrides = APOSTILLE_COUNTRY_OVERRIDES.filter(
    (item) =>
      Boolean(item.verifiedCycleByTrack[track]) &&
      item.verifiedCycleByTrack[track] !== expectedCycle
  );

  return (
    <main className="workspace-page mx-auto w-full max-w-[1040px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PageHeader eyebrow="Document authentication" title="Apostille Guide" description={dualTrackAccess ? "Switch between GKS-U and GKS-G to see national authentication rules, stage timing, and verified country-specific embassy notices." : `See which ${TRACK_LABELS[track]} documents need apostille or Korean-embassy consular confirmation, with source-cycle context visible.`} />

      <DisclaimerBanner />

      {dualTrackAccess ? (
        <ApostilleTrackToggle defaultTrack={track} />
      ) : (
        <>
          <GeneralDefaultSection data={APOSTILLE_GENERAL_DEFAULT[track]} />
          {track === "gks_u" && (
            <Card className="mt-4 border-primary/20 bg-primary-soft/30">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-primary">
                2027 GKS-U stage rule
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
                Embassy first-round certificates are uploaded as scanned copies. Authentication generally becomes
                necessary after passing Round 1 for the required certificates submitted to NIIED; the application
                forms themselves do not need apostille or consular confirmation.
              </p>
              <div className="mt-3">
                <GuidelineRuleActions
                  id="apostille-2027-stage-rule"
                  title="2027 GKS-U apostille timing"
                  text="Embassy first-round certificates are uploaded as scanned copies; required certificates for NIIED's second round generally need apostille or consular confirmation after passing Round 1, while application forms do not."
                  page="pp.14–15"
                  sourceUrl={GKS_U_2027_SOURCE.sourceUrl}
                  askQuestion="For 2027 GKS-U, explain exactly when apostille or consular confirmation is required, distinguishing Embassy first round from NIIED second round. Use only the official guideline."
                />
              </div>
            </Card>
          )}
        </>
      )}

      <h2 className="mt-8 text-[16px] font-semibold text-ink">
        Country-specific embassy notices
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        KMate now keeps local embassy procedures tied to the exact GKS cycle they were verified for. A previous-cycle
        notice is never presented as a current {expectedCycle} rule.
      </p>

      {currentOverrides.length > 0 ? (
        <div className="mt-4 flex flex-col gap-4">
          {currentOverrides.map((item) => (
            <CountryOverrideCard
              key={item.country}
              data={item}
              track={track}
              expectedCycle={expectedCycle}
            />
          ))}
        </div>
      ) : (
        <Card className="mt-4 bg-canvas">
          <p className="text-[12.75px] leading-relaxed text-muted">
            No country-specific override in KMate has been verified for your {expectedCycle}{" "}
            {track === "gks_u" ? "GKS-U" : "GKS-G"} cycle yet. Use the national rule above and check your Korean
            embassy&apos;s current-cycle notice before starting authentication.
          </p>
        </Card>
      )}

      {previousOverrides.length > 0 && (
        <details className="mt-4 rounded-2xl border border-hairline bg-white">
          <summary className="cursor-pointer list-none px-4 py-3.5 text-[12.5px] font-semibold text-ink">
            Previous-cycle embassy notices — reference only
          </summary>
          <div className="flex flex-col gap-4 border-t border-hairline p-4">
            {previousOverrides.map((item) => (
              <CountryOverrideCard
                key={item.country}
                data={item}
                track={track}
                expectedCycle={expectedCycle}
              />
            ))}
          </div>
        </details>
      )}

      <Card className="mt-6 bg-canvas">
        <p className="text-[12.5px] leading-relaxed text-muted">
          This page is a research reference built from NIIED&apos;s official guidelines and individual embassy
          notices, not an official NIIED product itself. Requirements can change between application cycles — always
          confirm with your own embassy or consulate&apos;s current GKS notice before beginning the authentication
          process.
        </p>
      </Card>
    </main>
  );
}
