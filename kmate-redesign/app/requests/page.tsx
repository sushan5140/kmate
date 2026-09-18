import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { ConnectionsTabBar, type ConnectionsTab } from "@/components/connections/connections-tab-bar";
import { IncomingRequestsList, type IncomingRequestRow } from "@/components/connections/incoming-requests-list";
import { SentRequestsList, type SentRequestRow } from "@/components/connections/sent-requests-list";
import { ConnectedList, type ConnectedPerson } from "@/components/connections/connected-list";
import { DiscoverTab } from "@/components/connections/discover-tab";
import type { Track, ContactType } from "@/lib/constants";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Connections — KMate",
};

interface ProfileEmbed {
  id: string;
  username: string | null;
  major: string | null;
  application_year: number | null;
  track: Track;
}

interface ConnectionRequestRow {
  id: string;
  status: "pending" | "accepted" | "declined" | "revoked";
  note: string | null;
  created_at: string;
  from_user_id: string;
  to_user_id: string;
  from_profile: ProfileEmbed;
  to_profile: ProfileEmbed;
}

const VALID_TABS: ConnectionsTab[] = ["received", "connected", "sent", "discover"];

interface ConnectionsSearchParams {
  tab?: string;
  track?: string | string[];
  major?: string;
  year?: string;
  university?: string;
}

/**
 * Reconstructs the exact URL for the tab currently being viewed, including
 * Discover's active filters -- passed down to every card as `?from=` so
 * /profile/[username] can render a back link that returns to precisely this
 * view rather than a reset tab. Only Discover carries filters, so other tabs
 * just get `?tab=`.
 */
function buildFromUrl(tab: ConnectionsTab, params: ConnectionsSearchParams): string {
  const sp = new URLSearchParams();
  sp.set("tab", tab);
  if (tab === "discover") {
    const tracks = Array.isArray(params.track) ? params.track : params.track ? [params.track] : [];
    for (const t of tracks) sp.append("track", t);
    if (params.major) sp.set("major", params.major);
    if (params.year) sp.set("year", params.year);
    if (params.university) sp.set("university", params.university);
  }
  return `/requests?${sp.toString()}`;
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<ConnectionsSearchParams>;
}) {
  const user = await requireOnboarded("/requests");
  const params = await searchParams;
  const admin = getSupabaseAdmin();

  const { data: rows } = await admin
    .from("connection_requests")
    .select(
      `id, status, note, created_at, from_user_id, to_user_id,
       from_profile:profiles!connection_requests_from_user_id_fkey ( id, username, major, application_year, track ),
       to_profile:profiles!connection_requests_to_user_id_fkey ( id, username, major, application_year, track )`
    )
    .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const all = (rows ?? []) as unknown as ConnectionRequestRow[];

  const received: IncomingRequestRow[] = all
    .filter((r) => r.to_user_id === user.id && r.status === "pending")
    .map((r) => ({ id: r.id, note: r.note, otherUser: { id: r.from_profile.id, username: r.from_profile.username } }));

  const sent: SentRequestRow[] = all
    .filter((r) => r.from_user_id === user.id && r.status === "pending")
    .map((r) => ({ id: r.id, createdAt: r.created_at, otherUser: { id: r.to_profile.id, username: r.to_profile.username } }));

  const connectedRequests = all.filter((r) => r.status === "accepted");

  const requestedTab = params.tab as ConnectionsTab | undefined;
  const defaultTab: ConnectionsTab = received.length > 0 ? "received" : "connected";
  const tab: ConnectionsTab = requestedTab && VALID_TABS.includes(requestedTab) ? requestedTab : defaultTab;
  const fromUrl = buildFromUrl(tab, params);

  // Only the active tab's own data gets fetched -- Discover's query (up to
  // 60 profiles with university joins) and the contact-methods lookup are
  // both skipped entirely unless that specific tab is open.
  let connected: ConnectedPerson[] = [];
  if (tab === "connected" && connectedRequests.length > 0) {
    const otherProfiles = connectedRequests.map((r) => (r.from_user_id === user.id ? r.to_profile : r.from_profile));
    const otherUserIds = otherProfiles.map((p) => p.id);
    const { data: contactRows } = await admin
      .from("contact_methods")
      .select("user_id, type, value")
      .in("user_id", otherUserIds);

    const contactsByUserId = new Map<string, { type: ContactType; value: string }[]>();
    for (const c of contactRows ?? []) {
      const list = contactsByUserId.get(c.user_id) ?? [];
      list.push({ type: c.type as ContactType, value: c.value });
      contactsByUserId.set(c.user_id, list);
    }

    connected = connectedRequests.map((r) => {
      const other = r.from_user_id === user.id ? r.to_profile : r.from_profile;
      return {
        requestId: r.id,
        id: other.id,
        username: other.username,
        major: other.major,
        applicationYear: other.application_year,
        track: other.track,
        contacts: contactsByUserId.get(other.id) ?? [],
      };
    });
  }

  return (
    <main className="workspace-page mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="Community"
        title="Connections"
        description="Find applicants whose application overlaps yours, manage requests, and keep conversations inside KMate."
        meta={
          <div className="flex flex-wrap gap-2 text-[10.5px] font-bold text-muted">
            <span className="rounded-[8px] bg-primary-soft px-2.5 py-1 text-primary">{connectedRequests.length} connected</span>
            <span className="rounded-[8px] bg-gks-u/10 px-2.5 py-1 text-gks-u">{received.length} waiting on you</span>
            <span className="rounded-[8px] bg-gks-g/10 px-2.5 py-1 text-gks-g">{sent.length} sent</span>
          </div>
        }
      />

      <div className="mt-6">
        <ConnectionsTabBar active={tab} receivedCount={received.length} />
      </div>

      <div className="mt-5">
        {tab === "received" && <IncomingRequestsList items={received} fromUrl={fromUrl} />}
        {tab === "connected" && <ConnectedList items={connected} fromUrl={fromUrl} />}
        {tab === "sent" && <SentRequestsList items={sent} fromUrl={fromUrl} />}
        {tab === "discover" && <DiscoverTab userId={user.id} params={params} fromUrl={fromUrl} />}
      </div>
    </main>
  );
}
