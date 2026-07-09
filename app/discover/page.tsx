import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { DiscoverFilters } from "@/components/discover/discover-filters";
import { ProfileCard, type ProfileCardData } from "@/components/profile/profile-card";
import type { Track } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Discover — KMate",
};

interface UniversityChoiceEmbed {
  priority: number;
  university: { id: string; name: string } | null;
}

interface DiscoverProfileRow {
  id: string;
  username: string;
  bio: string | null;
  track: Track;
  major: string | null;
  application_year: number | null;
  university_choices: UniversityChoiceEmbed[];
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string | string[]; major?: string; year?: string; university?: string }>;
}) {
  const user = await requireOnboarded("/discover");
  const params = await searchParams;
  const admin = getSupabaseAdmin();

  const { data: me } = await admin.from("profiles").select("track").eq("id", user.id).maybeSingle();
  const ownTrack: Track = (me?.track as Track) ?? "gks_u";

  const requestedTracks = Array.isArray(params.track) ? params.track : params.track ? [params.track] : [];
  const tracks = requestedTracks.length ? requestedTracks : [ownTrack];

  const universityId = params.university;

  // See build plan: !inner is required on the embed whenever we filter by a
  // nested university_choices column, otherwise PostgREST's default left
  // join only narrows which nested rows come back rather than excluding
  // non-matching outer profiles.
  const selectClause = universityId
    ? `id, username, bio, track, major, application_year,
       university_choices:university_choices!inner ( priority, university:universities ( id, name ) )`
    : `id, username, bio, track, major, application_year,
       university_choices ( priority, university:universities ( id, name ) )`;

  let query = admin
    .from("profiles")
    .select(selectClause)
    .not("username", "is", null)
    .neq("id", user.id)
    .in("track", tracks)
    .limit(60);

  if (params.major) query = query.eq("major", params.major);
  if (params.year) query = query.eq("application_year", Number(params.year));
  if (universityId) query = query.eq("university_choices.university_id", universityId);

  const { data } = await query;
  const profiles = (data ?? []) as unknown as DiscoverProfileRow[];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Discover</h1>
      <p className="mt-1 text-[13.5px] text-muted">
        Find other applicants preparing for the same major and universities.
      </p>

      <div className="mt-6">
        <DiscoverFilters ownTrack={ownTrack} />
      </div>

      {profiles.length === 0 ? (
        <p className="mt-10 text-[14px] text-muted">No applicants match these filters yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => {
            const priorityMatch = universityId
              ? profile.university_choices.find((u) => u.university?.id === universityId)
              : undefined;
            const cardData: ProfileCardData = {
              id: profile.id,
              username: profile.username,
              bio: profile.bio,
              track: profile.track,
              major: profile.major,
              applicationYear: profile.application_year,
              priorityBadge: priorityMatch?.priority ?? null,
            };
            return <ProfileCard key={profile.id} profile={cardData} />;
          })}
        </div>
      )}
    </main>
  );
}
