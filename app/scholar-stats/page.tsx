import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getCachedGksScholarStats, type GksTrack } from "@/lib/cached-content";
import { ScholarStatsApp } from "@/components/scholar-stats/scholar-stats-app";
import { Card } from "@/components/ui/card";
import { TRACK_LABELS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Scholar Stats — KMate",
};

export default async function ScholarStatsPage() {
  const user = await requireOnboarded("/scholar-stats");

  // Scoped to the user's own track -- onboarding requires picking one before
  // onboarding_completed_at is ever set, so requireOnboarded() already
  // guarantees this is present.
  const { data: profile } = await getSupabaseAdmin().from("profiles").select("track").eq("id", user.id).maybeSingle();
  const track = (profile?.track ?? "gks_g") as GksTrack;

  const data = await getCachedGksScholarStats(track);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Scholar Placement Stats</h1>
      <Card className="mt-4">
        <p className="text-[13.5px] leading-relaxed text-muted">
          Where {TRACK_LABELS[track]} 2026 Final Round scholars actually ended up — by university and by country.
          Sourced from NIIED&apos;s official successful-candidate lists (Embassy track, University track, and the
          combined Final Round result), cross-matched by candidate number.
        </p>
      </Card>
      <ScholarStatsApp data={data} />
    </main>
  );
}
