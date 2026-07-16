import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { Card, MicroLabel } from "@/components/ui/card";
import { TrackBadge } from "@/components/ui/track-badge";
import {
  ConnectionRequestButton,
  type ConnectionStatus,
} from "@/components/connections/connection-request-button";
import { ReportBlockMenu } from "@/components/profile/report-block-menu";
import { OwnProfileTabBar, type OwnProfileTab } from "@/components/profile/own-profile-tab-bar";
import { ProfileEditForm, type ProfileEditInitialData } from "@/components/profile/profile-edit-form";
import { EditContactsForm } from "@/components/settings/edit-contacts-form";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";
import type { ContactValue } from "@/components/onboarding/contacts-step";
import type { GksUEmbassyPath, Track } from "@/lib/constants";

interface UniversityChoiceRow {
  priority: number;
  university_id: string;
  eligibility_id: string | null;
  university: { id: string; name: string } | null;
  eligibility: { category: string; embassy_type: "type_a" | "type_b" | null } | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} — KMate` };
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { username } = await params;
  const viewer = await getAuthenticatedUser();
  const admin = getSupabaseAdmin();

  // Public profile render path -- deliberately never selects contact_methods
  // here at all, so there is no code path in this function that could leak
  // it, structurally, not just by RLS convention.
  const { data: profile } = await admin
    .from("profiles")
    .select(
      `id, username, bio, avatar_url, track, gks_u_embassy_path, major, application_year,
       university_choices ( priority, university_id, eligibility_id,
         university:universities ( id, name ),
         eligibility:university_eligibility ( category, embassy_type ) )`
    )
    .not("username", "is", null)
    .ilike("username", username)
    .maybeSingle();

  if (!profile) notFound();

  const isSelf = viewer?.id === profile.id;

  const universities = ((profile.university_choices ?? []) as unknown as UniversityChoiceRow[]).sort(
    (a, b) => a.priority - b.priority
  );

  // --- Own profile: tabbed edit view, no public-view/connection logic needed ---
  if (isSelf) {
    const { tab: rawTab } = await searchParams;
    const tab: OwnProfileTab = rawTab === "contacts" ? "contacts" : "profile";

    const contactsInitial: ContactValue[] =
      tab === "contacts"
        ? ((
            await admin.from("contact_methods").select("type, value").eq("user_id", profile.id)
          ).data as ContactValue[] | null) ?? []
        : [];

    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-[22px] font-semibold text-ink">@{profile.username}</h1>
        <div className="mt-4">
          <OwnProfileTabBar active={tab} />
        </div>

        <div className="mt-6">
          {tab === "profile" ? (
            <>
              <ProfileEditForm
                initial={
                  {
                    track: profile.track as Track,
                    gksUEmbassyPath: profile.gks_u_embassy_path as GksUEmbassyPath | null,
                    major: profile.major ?? "",
                    applicationYear: profile.application_year ?? new Date().getFullYear(),
                    username: profile.username ?? "",
                    bio: profile.bio ?? "",
                    universities: universities.map((u) => ({
                      universityId: u.university_id,
                      name: u.university?.name ?? "",
                      eligibilityId: u.eligibility_id,
                      embassyType: u.eligibility?.embassy_type ?? null,
                      category: u.eligibility?.category ?? null,
                    })),
                  } satisfies ProfileEditInitialData
                }
              />
              <div className="mt-10 border-t border-border pt-6">
                <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Danger zone</p>
                <div className="mt-2">
                  <DeleteAccountButton />
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-[13.5px] text-muted">
                Private -- only visible to people once you accept a connection request from them.
              </p>
              <div className="mt-4">
                <EditContactsForm initial={contactsInitial} />
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  // --- Someone else's profile: unchanged public view + connection flow ---
  let connectionStatus: ConnectionStatus = "none";
  let pendingRequestId: string | null = null;
  let contacts: { type: string; value: string }[] = [];

  if (viewer) {
    const { data: connection } = await admin
      .from("connection_requests")
      .select("id, from_user_id, to_user_id, status")
      .or(
        `and(from_user_id.eq.${viewer.id},to_user_id.eq.${profile.id}),and(from_user_id.eq.${profile.id},to_user_id.eq.${viewer.id})`
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connection?.status === "accepted") {
      connectionStatus = "accepted";
      pendingRequestId = connection.id;
      const { data: contactRows } = await admin
        .from("contact_methods")
        .select("type, value")
        .eq("user_id", profile.id);
      contacts = contactRows ?? [];
    } else if (connection?.status === "pending") {
      connectionStatus = connection.from_user_id === viewer.id ? "pending_outgoing" : "pending_incoming";
    }
  }

  const publicUniversities = universities.filter((u) => u.university);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold text-ink">@{profile.username}</h1>
            {profile.bio && <p className="mt-1 text-[14px] text-muted">{profile.bio}</p>}
          </div>
          <div className="flex items-center gap-2">
            {profile.track && <TrackBadge track={profile.track as Track} />}
            {viewer && <ReportBlockMenu targetType="profile" targetId={profile.id} blockedUserId={profile.id} />}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <MicroLabel>Major</MicroLabel>
            <p className="mt-0.5 text-[14px] text-ink">{profile.major ?? "—"}</p>
          </div>
          <div>
            <MicroLabel>Application year</MicroLabel>
            <p className="mt-0.5 text-[14px] text-ink">{profile.application_year ?? "—"}</p>
          </div>
        </div>

        {publicUniversities.length > 0 && (
          <div className="mt-5">
            <MicroLabel>Universities</MicroLabel>
            <ol className="mt-1.5 flex flex-col gap-1">
              {publicUniversities.map((u) => (
                <li key={u.university!.id} className="flex items-center gap-2 text-[14px] text-ink">
                  <span className="text-[12px] text-muted">#{u.priority}</span>
                  {u.university!.name}
                </li>
              ))}
            </ol>
          </div>
        )}

        {viewer && (
          <div className="mt-6 border-t border-border pt-5">
            <ConnectionRequestButton
              targetUserId={profile.id}
              initialStatus={connectionStatus}
              connectionId={pendingRequestId}
            />
          </div>
        )}

        {connectionStatus === "accepted" && contacts.length > 0 && (
          <div className="mt-5 rounded-xl border border-border bg-canvas p-4">
            <MicroLabel>Contact</MicroLabel>
            <ul className="mt-2 flex flex-col gap-1">
              {contacts.map((c) => (
                <li key={c.type} className="text-[14px] text-ink">
                  <span className="capitalize text-muted">{c.type}:</span> {c.value}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-muted">
              Revoking removes each other&apos;s access to contact info going forward. It can&apos;t
              retract anything already seen or saved.
            </p>
          </div>
        )}
      </Card>
    </main>
  );
}
