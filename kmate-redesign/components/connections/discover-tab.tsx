import { getSupabaseAdmin } from "@/lib/supabase/server";
import { DiscoverFilters } from "@/components/discover/discover-filters";
import { DiscoverScrollRestore } from "@/components/discover/discover-scroll-restore";
import { ProfileCard, type ProfileCardData } from "@/components/profile/profile-card";
import type { ConnectionStatus } from "@/components/connections/connection-request-button";
import type { Track } from "@/lib/constants";
import { Card, MicroLabel } from "@/components/ui/card";
import { TrackBadge } from "@/components/ui/track-badge";
import { isDemoUserId } from "@/lib/demo-mode";

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


const DEMO_PROFILES = [
  { username: "applicant-01", bio: "AI / computer science applicant comparing regional universities.", track: "gks_u" as Track, major: "Computer Science", applicationYear: 2027, universities: ["Pusan National University", "Kyungpook National University"] },
  { username: "applicant-02", bio: "Electrical engineering applicant building a University Track application.", track: "gks_u" as Track, major: "Electrical Engineering", applicationYear: 2027, universities: ["Dong-Eui University"] },
  { username: "applicant-03", bio: "Graduate applicant focused on data science and research experience.", track: "gks_g" as Track, major: "Data Science", applicationYear: 2027, universities: ["Ajou University", "Inha University"] },
  { username: "applicant-04", bio: "Software applicant preparing interview answers and document verification.", track: "gks_u" as Track, major: "Software Engineering", applicationYear: 2027, universities: ["Chungnam National University"] },
  { username: "applicant-05", bio: "Mechanical engineering applicant checking embassy-track eligibility.", track: "gks_u" as Track, major: "Mechanical Engineering", applicationYear: 2027, universities: ["Jeonbuk National University"] },
  { username: "applicant-06", bio: "Graduate applicant organizing research fit and scholarship deadlines.", track: "gks_g" as Track, major: "Artificial Intelligence", applicationYear: 2027, universities: ["Konkuk University"] },
];

function DemoDiscoverGrid() {
  return (
    <div>
      <div className="rounded-[18px] border border-primary/15 bg-primary-soft px-4 py-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-primary">Raw preview</p>
        <p className="mt-1 text-[11.5px] font-medium leading-5 text-muted">
          These are fictional preview applicants. Real KMate profiles stay behind real account access.
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {DEMO_PROFILES.map((profile) => (
          <Card key={profile.username} className="flex min-h-[220px] flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-canvas text-[12px] font-extrabold text-ink ring-1 ring-hairline">
                  {profile.username.slice(-2)}
                </span>
                <div>
                  <p className="text-[13px] font-extrabold text-ink">@{profile.username}</p>
                  <p className="mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted/60">Demo profile</p>
                </div>
              </div>
              <TrackBadge track={profile.track} />
            </div>
            <p className="mt-4 text-[11.5px] font-medium leading-5 text-muted">{profile.bio}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-[14px] bg-canvas/55 p-3">
              <div>
                <MicroLabel>Major</MicroLabel>
                <p className="mt-1 text-[11px] font-bold text-ink">{profile.major}</p>
              </div>
              <div>
                <MicroLabel>Year</MicroLabel>
                <p className="mt-1 text-[11px] font-bold text-ink">{profile.applicationYear}</p>
              </div>
            </div>
            <div className="mt-3">
              <MicroLabel>Targets</MicroLabel>
              <p className="mt-1 line-clamp-2 text-[10.5px] font-medium leading-5 text-muted">{profile.universities.join(" · ")}</p>
            </div>
            <div className="mt-auto pt-4">
              <span className="block rounded-[12px] bg-ink px-3 py-2.5 text-center text-[10.5px] font-extrabold text-white/80">
                Connection flow preview
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * Unchanged in behavior from the standalone /discover page it replaced --
 * same query, same filters, just relocated under the "Discover new" tab of
 * the consolidated Connections page (app/requests/page.tsx).
 */
export async function DiscoverTab({
  userId,
  params,
  fromUrl,
}: {
  userId: string;
  params: { track?: string | string[]; major?: string; year?: string; university?: string };
  fromUrl: string;
}) {
  if (isDemoUserId(userId)) {
    return <DemoDiscoverGrid />;
  }

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

  // Same connection-status lookup the profile page does for a single user,
  // batched here so cards don't all say "Connect" even after a request was
  // already sent/accepted -- that mismatch only becomes visible once you
  // click through, since the card itself never checked.
  const connectionStatusByProfileId = new Map<string, ConnectionStatus>();
  if (profiles.length) {
    const idList = profiles.map((p) => p.id).join(",");
    const { data: connections } = await admin
      .from("connection_requests")
      .select("id, from_user_id, to_user_id, status, created_at")
      .or(`and(from_user_id.eq.${userId},to_user_id.in.(${idList})),and(to_user_id.eq.${userId},from_user_id.in.(${idList}))`)
      .order("created_at", { ascending: false });

    const seenCounterparts = new Set<string>();
    for (const c of connections ?? []) {
      const otherId = c.from_user_id === userId ? c.to_user_id : c.from_user_id;
      // Rows are newest-first, so the first one seen per counterpart is the
      // current state -- an older "accepted" row from before a later
      // decline/revoke must not resurface just because this row's status
      // doesn't map to anything shown on the card.
      if (seenCounterparts.has(otherId)) continue;
      seenCounterparts.add(otherId);
      if (c.status === "accepted") {
        connectionStatusByProfileId.set(otherId, "accepted");
      } else if (c.status === "pending") {
        connectionStatusByProfileId.set(otherId, c.from_user_id === userId ? "pending_outgoing" : "pending_incoming");
      }
    }
  }

  return (
    <div>
      <DiscoverScrollRestore />
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
              connectionStatus: connectionStatusByProfileId.get(profile.id) ?? "none",
            };
            return <ProfileCard key={profile.id} profile={cardData} fromUrl={fromUrl} />;
          })}
        </div>
      )}
    </div>
  );
}
