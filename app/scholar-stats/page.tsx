import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getCachedGksScholarStats, type GksTrack } from "@/lib/cached-content";
import { ScholarStatsApp } from "@/components/scholar-stats/scholar-stats-app";
import { ScholarStatsTrackToggle } from "@/components/scholar-stats/track-toggle";
import { Card } from "@/components/ui/card";
import { TRACK_LABELS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Scholar Stats — KMate",
};

export default async function ScholarStatsPage() {
  const user = await requireOnboarded("/scholar-stats");

  // Scoped to the user's own track -- onboarding requires picking one before
  // onboarding_completed_at is ever set, so requireOnboarded() already
  // guarantees this is present. dual_track_access is an admin-granted
  // override (see /admin/users) for selected applicants who legitimately
  // need both tracks' data -- everyone else stays hard-scoped to their own.
  const { data: profile } = await getSupabaseAdmin()
    .from("profiles")
    .select("track, dual_track_access")
    .eq("id", user.id)
    .maybeSingle();
  const track = (profile?.track ?? "gks_g") as GksTrack;
  const dualTrackAccess = profile?.dual_track_access ?? false;

  const intro = (
    <Card className="mt-4">
      <p className="text-[13.5px] leading-relaxed text-muted">
        Where {dualTrackAccess ? "" : `${TRACK_LABELS[track]} `}2026 Final Round scholars actually ended up — by
        university and by country. Sourced from NIIED&apos;s official successful-candidate lists (Embassy track,
        University track, and the combined Final Round result), cross-matched by candidate number.
      </p>
    </Card>
  );

  if (dualTrackAccess) {
    const [gksG, gksU] = await Promise.all([getCachedGksScholarStats("gks_g"), getCachedGksScholarStats("gks_u")]);
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-[22px] font-semibold text-ink">Scholar Placement Stats</h1>
        {intro}
        <ScholarStatsTrackToggle defaultTrack={track} gksG={gksG} gksU={gksU} />
      </main>
    );
  }

  const data = await getCachedGksScholarStats(track);
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Scholar Placement Stats</h1>
      {intro}
      <ScholarStatsApp data={data} />
    </main>
  );
}
