import type { Metadata } from "next";
import { requireOnboarded, createClient } from "@/lib/supabase/auth-server";
import { Card } from "@/components/ui/card";
import { DisclaimerBanner } from "@/components/apostille/disclaimer-banner";
import { ApostilleTabs } from "@/components/apostille/apostille-tabs";
import { CountryOverrideCard } from "@/components/apostille/country-override-card";
import { APOSTILLE_COUNTRY_OVERRIDES } from "@/lib/apostille-requirements";
import type { Track } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Apostille Guide — KMate",
};

export default async function ApostillePage() {
  const user = await requireOnboarded("/apostille");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("track").eq("id", user.id).maybeSingle();
  const defaultTrack = (profile?.track as Track | null) ?? "gks_g";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Documents to Apostille</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
        Which application documents need an apostille or Korean-embassy consular confirmation, per NIIED&apos;s official
        guidelines — plus the handful of countries with a confirmed, different local process.
      </p>

      <DisclaimerBanner />

      <ApostilleTabs defaultTrack={defaultTrack} />

      <h2 className="mt-8 text-[16px] font-semibold text-ink">Confirmed country-specific differences</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        These countries have an official embassy notice describing something genuinely different from the general
        default above — not just local logistics. Not finding your country here doesn&apos;t mean nothing&apos;s
        different for you; it means no such notice has been found and confirmed yet. When in doubt, check your own
        embassy&apos;s current GKS notice.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {APOSTILLE_COUNTRY_OVERRIDES.map((c) => (
          <CountryOverrideCard key={c.country} data={c} />
        ))}
      </div>

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
