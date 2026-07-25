import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getCachedGksScholarStats } from "@/lib/cached-content";
import { ScholarStatsApp } from "@/components/scholar-stats/scholar-stats-app";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Scholar Stats — KMate",
};

export default async function ScholarStatsPage() {
  await requireOnboarded("/scholar-stats");

  const [gksG, gksU] = await Promise.all([getCachedGksScholarStats("gks_g"), getCachedGksScholarStats("gks_u")]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Scholar Placement Stats</h1>
      <Card className="mt-4">
        <p className="text-[13.5px] leading-relaxed text-muted">
          Where 2026 GKS Final Round scholars actually ended up — by university and by country. Sourced from NIIED&apos;s
          official successful-candidate lists (Embassy track, University track, and the combined Final Round result),
          cross-matched by candidate number. GKS-G (graduate) and GKS-U (undergraduate) are shown separately since
          they&apos;re different applicant pools with very different seat counts.
        </p>
      </Card>
      <ScholarStatsApp gksG={gksG} gksU={gksU} />
    </main>
  );
}
