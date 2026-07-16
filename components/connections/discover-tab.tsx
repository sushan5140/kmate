import { getSupabaseAdmin } from "@/lib/supabase/server";
import { DiscoverFilters } from "@/components/discover/discover-filters";
import { ProfileCard, type ProfileCardData } from "@/components/profile/profile-card";
import type { Track } from "@/lib/constants";

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

/**
 * Unchanged in behavior from the standalone /discover page it replaced --
 * same query, same filters, just relocated under the "Discover new" tab of
 * the consolidated Connections page (app/requests/page.tsx).
 */
export async function DiscoverTab({
  userId,
  params,
}: {
  userId: string;
  params: { track?: string | string[]; major?: string; year?: string; university?: string };
}) {
  const admin = getSupabaseAdmin();

  const { data: me } = await admin.from("profiles").select("track").eq("id", userId).maybeSingle();
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
    .neq("id", userId)
    .in("track", tracks)
    .limit(60);

  if (params.major) query = query.eq("major", params.major);
  if (params.year) query = query.eq("application_year", Number(params.year));
  if (universityId) query = query.eq("university_choices.university_id", universityId);

  const { data } = await query;
  const profiles = (data ?? []) as unknown as DiscoverProfileRow[];

  return (
    <div>
      <DiscoverFilters ownTrack={ownTrack} />

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
    </div>
  );
}
