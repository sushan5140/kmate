import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { ChatApp, type ConversationSummary } from "@/components/chat/chat-app";
import type { Track } from "@/lib/constants";

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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">Messages</h1>
      <p className="mt-1.5 text-[13.5px] text-muted">
        Private 1:1 chats with applicants you&apos;ve connected with.
      </p>
      <div className="mt-6">
        <ChatApp currentUserId={user.id} conversations={summaries} initialActiveId={activeId} />
      </div>
    </main>
  );
}
