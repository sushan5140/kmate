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

interface UniversityChoiceRow {
  priority: number;
  university: { id: string; name: string } | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} — KMate` };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const viewer = await getAuthenticatedUser();
  const admin = getSupabaseAdmin();

  // Public profile render path -- deliberately never selects contact_methods
  // here at all, so there is no code path in this function that could leak
  // it, structurally, not just by RLS convention.
  const { data: profile } = await admin
    .from("profiles")
    .select(
      `id, username, bio, avatar_url, track, major, application_year,
       university_choices ( priority, university:universities ( id, name ) )`
    )
    .not("username", "is", null)
    .ilike("username", username)
    .maybeSingle();

  if (!profile) notFound();

  const isSelf = viewer?.id === profile.id;
  let connectionStatus: ConnectionStatus = "none";
  let pendingRequestId: string | null = null;
  let contacts: { type: string; value: string }[] = [];

  if (viewer && !isSelf) {
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

  const universities = ((profile.university_choices ?? []) as unknown as UniversityChoiceRow[])
    .filter((u) => u.university)
    .sort((a, b) => a.priority - b.priority);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold text-ink">@{profile.username}</h1>
            {profile.bio && <p className="mt-1 text-[14px] text-muted">{profile.bio}</p>}
          </div>
          <div className="flex items-center gap-2">
            {profile.track && <TrackBadge track={profile.track} />}
            {viewer && !isSelf && (
              <ReportBlockMenu targetType="profile" targetId={profile.id} blockedUserId={profile.id} />
            )}
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

        {universities.length > 0 && (
          <div className="mt-5">
            <MicroLabel>Universities</MicroLabel>
            <ol className="mt-1.5 flex flex-col gap-1">
              {universities.map((u) => (
                <li key={u.university!.id} className="flex items-center gap-2 text-[14px] text-ink">
                  <span className="text-[12px] text-muted">#{u.priority}</span>
                  {u.university!.name}
                </li>
              ))}
            </ol>
          </div>
        )}

        {viewer && !isSelf && (
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
