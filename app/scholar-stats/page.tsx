import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  getCachedGksScholarStats,
  getCachedUniversityEmbassyTypes,
  type GksTrack,
} from "@/lib/cached-content";
import { resolveEmbassyTypes } from "@/lib/scholar-stats/university-type";
import { universityFromSlug } from "@/lib/scholar-stats/comparison";
import { ScholarStatsApp, type TrackData } from "@/components/scholar-stats/scholar-stats-app";
import { ScholarStatsTrackToggle } from "@/components/scholar-stats/track-toggle";
import { Card } from "@/components/ui/card";
import { TRACK_LABELS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Scholar Stats — KMate",
};

/**
 * Stats rows plus the Type A/Type B badge for each university in them. The
 * name-matching runs here, once per track per cache window, rather than in the
 * browser -- the client only ever receives the finished lookup.
 */
async function loadTrackData(track: GksTrack): Promise<TrackData> {
  const [stats, embassySources] = await Promise.all([
    getCachedGksScholarStats(track),
    getCachedUniversityEmbassyTypes(track),
  ]);
  return {
    ...stats,
    embassyTypes: resolveEmbassyTypes(
      stats.universities.map((u) => u.university),
      embassySources
    ),
  };
}

/**
 * `?compare=kookmin-university,hongik-university` -- resolved here rather than
 * in the browser so a shared link renders the comparison on first paint, with
 * no client-side URL read to hydrate around. Unknown slugs resolve to null and
 * the panel simply opens with that side empty.
 */
function parseCompareParam(raw: string | undefined, names: readonly string[]): [string | null, string | null] | null {
  if (!raw) return null;
  const [a, b] = raw.split(",");
  return [a ? universityFromSlug(a, names) : null, b ? universityFromSlug(b, names) : null];
}

export default async function ScholarStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ compare?: string }>;
}) {
  const user = await requireOnboarded("/scholar-stats");
  const { compare } = await searchParams;

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
    const [gksG, gksU] = await Promise.all([loadTrackData("gks_g"), loadTrackData("gks_u")]);
    const defaultData = track === "gks_g" ? gksG : gksU;
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-[22px] font-semibold text-ink">Scholar Placement Stats</h1>
        {intro}
        <ScholarStatsTrackToggle
          defaultTrack={track}
          gksG={gksG}
          gksU={gksU}
          initialCompare={parseCompareParam(compare, defaultData.universities.map((u) => u.university))}
        />
      </main>
    );
  }

  const data = await loadTrackData(track);
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Scholar Placement Stats</h1>
      {intro}
      <ScholarStatsApp
        data={data}
        track={track}
        initialCompare={parseCompareParam(compare, data.universities.map((u) => u.university))}
      />
    </main>
  );
}
