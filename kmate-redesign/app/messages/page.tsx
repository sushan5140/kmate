import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { ChatApp, type ConversationSummary } from "@/components/chat/chat-app";
import type { Track } from "@/lib/constants";
import { isDemoUserId } from "@/lib/demo-mode";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Messages — KMate",
};

// The conversation list changes whenever anyone sends a message, so this must
// never be served from a cache.
export const dynamic = "force-dynamic";

interface ConversationRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  last_message_at: string | null;
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireOnboarded("/messages");
  const { c: requestedConversationId } = await searchParams;

  if (isDemoUserId(user.id)) {
    const previewConversations: ConversationSummary[] = [
      { id: "preview-chat-1", otherUserId: "preview-user-1", otherUsername: "applicant-01", otherTrack: "gks_u", lastMessageAt: "2026-09-18T18:46:00+05:30", lastMessageBody: "I’m comparing the requirement checker with the official guideline now.", lastMessageFromMe: false, unreadCount: 2 },
      { id: "preview-chat-2", otherUserId: "preview-user-2", otherUsername: "applicant-04", otherTrack: "gks_u", lastMessageAt: "2026-09-17T20:10:00+05:30", lastMessageBody: "By theme first, then I’m drafting short answer points in Interview DB.", lastMessageFromMe: false, unreadCount: 0 },
      { id: "preview-chat-3", otherUserId: "preview-user-3", otherUsername: "applicant-03", otherTrack: "gks_g", lastMessageAt: "2026-09-14T17:32:00+05:30", lastMessageBody: "The official notices filter made the Embassy/University updates easier to separate.", lastMessageFromMe: false, unreadCount: 0 },
    ];
    const activePreview = previewConversations.some((item) => item.id === requestedConversationId) ? requestedConversationId! : previewConversations[0].id;
    return (
      <main className="workspace-page mx-auto w-full max-w-[1180px] px-0 py-0 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
        <div className="hidden sm:block">
          <PageHeader eyebrow="Community" title="Messages" description="The same KMate inbox and thread layout as production, opened directly in the raw workspace." meta={<span className="inline-flex rounded-full bg-primary-soft px-2.5 py-1 text-[9.5px] font-extrabold text-primary">Preview threads stay local</span>} />
        </div>
        <div className="sm:mt-6"><ChatApp currentUserId={user.id} conversations={previewConversations} initialActiveId={activePreview} previewMode /></div>
      </main>
    );
  }

  const admin = getSupabaseAdmin();

  const { data: convRows } = await admin
    .from("conversations")
    .select("id, user_a_id, user_b_id, last_message_at")
    .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);

  const conversations = (convRows ?? []) as ConversationRow[];
  const otherIds = conversations.map((c) => (c.user_a_id === user.id ? c.user_b_id : c.user_a_id));

  // Three small batched lookups rather than per-conversation queries.
  const [{ data: profiles }, { data: lastMessages }, { data: unreadRows }] = await Promise.all([
    otherIds.length
      ? admin.from("profiles").select("id, username, track").in("id", otherIds)
      : Promise.resolve({ data: [] as { id: string; username: string | null; track: string | null }[] }),
    conversations.length
      ? admin
          .from("messages")
          .select("conversation_id, body, created_at, sender_id")
          .in("conversation_id", conversations.map((c) => c.id))
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { conversation_id: string; body: string; created_at: string; sender_id: string }[] }),
    conversations.length
      ? admin
          .from("messages")
          .select("conversation_id")
          .in("conversation_id", conversations.map((c) => c.id))
          .neq("sender_id", user.id)
          .is("read_at", null)
      : Promise.resolve({ data: [] as { conversation_id: string }[] }),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  // lastMessages is ordered newest-first, so the first row seen per
  // conversation is its latest message.
  const latestByConversation = new Map<string, { body: string; created_at: string; sender_id: string }>();
  for (const m of lastMessages ?? []) {
    if (!latestByConversation.has(m.conversation_id)) latestByConversation.set(m.conversation_id, m);
  }

  const unreadByConversation = new Map<string, number>();
  for (const r of unreadRows ?? []) {
    unreadByConversation.set(r.conversation_id, (unreadByConversation.get(r.conversation_id) ?? 0) + 1);
  }

  const summaries: ConversationSummary[] = conversations.map((c) => {
    const otherId = c.user_a_id === user.id ? c.user_b_id : c.user_a_id;
    const other = profileById.get(otherId);
    const latest = latestByConversation.get(c.id);
    return {
      id: c.id,
      otherUserId: otherId,
      otherUsername: other?.username ?? null,
      otherTrack: (other?.track as Track) ?? null,
      lastMessageAt: c.last_message_at,
      lastMessageBody: latest?.body ?? null,
      lastMessageFromMe: latest ? latest.sender_id === user.id : false,
      unreadCount: unreadByConversation.get(c.id) ?? 0,
    };
  });

  // Only honour ?c= for a conversation the viewer is actually in -- otherwise
  // a guessed id would open an empty thread shell.
  const activeId = summaries.some((s) => s.id === requestedConversationId)
    ? requestedConversationId!
    : null;

  return (
    <main className="workspace-page mx-auto w-full max-w-[1180px] px-0 py-0 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="hidden sm:block">
        <PageHeader
          eyebrow="Community"
          title="Messages"
          description="Private 1:1 conversations with applicants you have chosen to connect with."
          meta={
            <span className="inline-flex rounded-full bg-surface px-2.5 py-1 text-[10.5px] font-bold text-muted ring-1 ring-hairline">
              {summaries.length} conversation{summaries.length === 1 ? "" : "s"}
            </span>
          }
        />
      </div>
      <div className="sm:mt-6">
        <ChatApp currentUserId={user.id} conversations={summaries} initialActiveId={activeId} />
      </div>
    </main>
  );
}
