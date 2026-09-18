"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient, ensureRealtimeAuth } from "@/lib/supabase/browser-client";
import { Card } from "@/components/ui/card";
import { ArrowLeft, MessageCircleMore, Send } from "lucide-react";
import { MessageThread, type ChatMessage } from "@/components/chat/message-thread";
import { TrackBadge } from "@/components/ui/track-badge";
import type { Track } from "@/lib/constants";

export interface ConversationSummary {
  id: string;
  otherUserId: string;
  otherUsername: string | null;
  otherTrack: Track | null;
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  lastMessageFromMe: boolean;
  unreadCount: number;
}

function formatListTimestamp(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const byRecency = (a: ConversationSummary, b: ConversationSummary) =>
  (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");

const PREVIEW_THREADS: Record<string, { mine: boolean; body: string; time: string }[]> = {
  "preview-chat-1": [
    { mine: false, body: "Are you also building the 2027 GKS-U document set first?", time: "6:42 PM" },
    { mine: true, body: "Yeah. I’m checking route, documents, and university extras before writing anything.", time: "6:44 PM" },
    { mine: false, body: "Same. I’m comparing the requirement checker with the official guideline now.", time: "6:46 PM" },
  ],
  "preview-chat-2": [
    { mine: true, body: "How are you organizing interview prep?", time: "Yesterday" },
    { mine: false, body: "By theme first, then I’m drafting short answer points in Interview DB.", time: "Yesterday" },
  ],
  "preview-chat-3": [
    { mine: false, body: "The official notices filter made the Embassy/University updates much easier to separate.", time: "Mon" },
  ],
};

function PreviewThread({ conversation, onBack }: { conversation: ConversationSummary; onBack: () => void }) {
  const [messages, setMessages] = useState(PREVIEW_THREADS[conversation.id] ?? []);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setMessages(PREVIEW_THREADS[conversation.id] ?? []);
    setDraft("");
  }, [conversation.id]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    setMessages((rows) => [...rows, { mine: true, body, time: "Now" }]);
    setDraft("");
  }

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <div className="flex h-14 items-center gap-2.5 border-b border-hairline px-4">
        <button type="button" onClick={onBack} aria-label="Back to conversations" className="pressable md:hidden">
          <ArrowLeft className="h-4 w-4 text-muted" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-extrabold text-ink">@{conversation.otherUsername ?? "applicant"}</p>
          <p className="mt-0.5 text-[9.5px] font-semibold text-muted">Preview conversation</p>
        </div>
        {conversation.otherTrack && <TrackBadge track={conversation.otherTrack} />}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.mine ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[82%]">
                <div className={`rounded-[16px] px-3.5 py-2.5 text-[12px] font-medium leading-5 ${message.mine ? "bg-ink text-white" : "bg-canvas text-ink"}`}>{message.body}</div>
                <p className={`mt-1 text-[9px] font-medium text-muted ${message.mine ? "text-right" : ""}`}>{message.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-hairline p-3 sm:p-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 500))} rows={1} placeholder="Write a message…" className="max-h-28 flex-1 resize-y rounded-[13px] border border-hairline-strong bg-canvas/55 px-3 py-2.5 text-[12px] font-medium text-ink outline-none focus:border-primary focus:bg-white" />
          <button type="button" onClick={send} disabled={!draft.trim()} className="pressable flex h-10 w-10 items-center justify-center rounded-[12px] bg-ink text-white disabled:opacity-35" aria-label="Send preview message"><Send className="h-4 w-4" /></button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-[9px] font-medium text-muted/70">Raw preview: this composer stays local and does not send to a real applicant.</p>
      </div>
    </div>
  );
}

export function ChatApp({
  currentUserId,
  conversations: initialConversations,
  initialActiveId,
  previewMode = false,
}: {
  currentUserId: string;
  conversations: ConversationSummary[];
  initialActiveId: string | null;
  previewMode?: boolean;
}) {
  const router = useRouter();
  // One client for the component's lifetime -- rebuilding it every render
  // would tear down and re-establish the realtime socket constantly.
  const supabase = useMemo(() => createClient(), []);

  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialActiveId);
  const active = conversations.find((c) => c.id === activeId) ?? null;

  // Written in an effect, never during render, so the realtime handler can
  // read the current selection without resubscribing on every change.
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const applyMessageToList = useCallback(
    (msg: ChatMessage, opts: { countUnread: boolean }) => {
      setConversations((rows) => {
        if (!rows.some((r) => r.id === msg.conversation_id)) return rows;
        return rows
          .map((r) =>
            r.id === msg.conversation_id
              ? {
                  ...r,
                  lastMessageAt: msg.created_at,
                  lastMessageBody: msg.body,
                  lastMessageFromMe: msg.sender_id === currentUserId,
                  unreadCount:
                    opts.countUnread && msg.sender_id !== currentUserId
                      ? r.unreadCount + 1
                      : r.unreadCount,
                }
              : r
          )
          .sort(byRecency);
      });
    },
    [currentUserId]
  );

  const clearUnread = useCallback((conversationId: string) => {
    setConversations((rows) =>
      rows.map((r) => (r.id === conversationId ? { ...r, unreadCount: 0 } : r))
    );
  }, []);

  /** Called by the open thread for its own inserts, so previews stay in sync. */
  const handleThreadActivity = useCallback(
    (msg: ChatMessage) => applyMessageToList(msg, { countUnread: false }),
    [applyMessageToList]
  );

  // List-level realtime: keeps previews/unread badges live for conversations
  // that are NOT currently open. The open thread has its own scoped
  // subscription, so messages there are skipped here to avoid double-counting.
  useEffect(() => {
    if (previewMode) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // See ensureRealtimeAuth: without this the socket is anon and RLS
      // withholds every event, with no error to notice.
      await ensureRealtimeAuth(supabase);
      if (cancelled) return;

      channel = supabase
        .channel("chat-inbox")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          const msg = payload.new as ChatMessage;
          if (msg.conversation_id === activeIdRef.current) return;
          applyMessageToList(msg, { countUnread: true });
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, applyMessageToList, previewMode]);

  function openConversation(id: string) {
    setActiveId(id);
    // Keeps the thread linkable and refresh-safe without a server round-trip.
    window.history.replaceState(null, "", `/messages?c=${id}`);
  }

  function closeConversation() {
    setActiveId(null);
    window.history.replaceState(null, "", "/messages");
  }

  if (conversations.length === 0) {
    return (
      <Card className="mx-4 mt-4 flex min-h-[240px] flex-col items-center justify-center text-center sm:mx-0 sm:mt-0">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-primary-soft text-primary">
          <MessageCircleMore className="h-5 w-5" />
        </span>
        <p className="mt-4 max-w-sm text-[12px] font-medium leading-6 text-muted">
          No conversations yet. Start one from{" "}
          <Link href="/requests?tab=connected" className="font-extrabold text-primary hover:underline">
            your connections
          </Link>
          .
        </p>
      </Card>
    );
  }

  return (
    <div className="overflow-hidden border-y border-hairline bg-surface shadow-card sm:rounded-[24px] sm:border md:grid md:h-[72vh] md:min-h-[560px] md:grid-cols-[310px_1fr]">
      {/* On mobile the list gives way to the open thread; on md+ both show. */}
      <div className={activeId ? "hidden md:block md:border-r md:border-hairline" : "block md:border-r md:border-hairline"}>
        <div className="flex h-14 items-center border-b border-hairline px-4">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-muted/70">Conversations</p>{previewMode && <p className="mt-0.5 text-[9px] font-medium text-muted/65">Raw workspace preview</p>}</div>
        </div>
        <div className="h-[calc(72vh-56px)] min-h-[504px] overflow-y-auto">
          <ul className="divide-y divide-hairline">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openConversation(c.id)}
                  className={`pressable flex w-full flex-col gap-1 px-4 py-3.5 text-left hover:bg-canvas/70 ${
                    c.id === activeId ? "bg-primary-soft" : ""
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12.5px] font-extrabold text-ink">
                      @{c.otherUsername ?? "unknown"}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {c.unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">
                          {c.unreadCount > 99 ? "99+" : c.unreadCount}
                        </span>
                      )}
                      <span className="text-[11px] text-muted">{formatListTimestamp(c.lastMessageAt)}</span>
                    </span>
                  </span>
                  <span className="truncate text-[11px] font-medium text-muted">
                    {c.lastMessageBody
                      ? `${c.lastMessageFromMe ? "You: " : ""}${c.lastMessageBody}`
                      : "No messages yet"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={activeId ? "block min-w-0" : "hidden min-w-0 md:block"}>
        {!active ? (
          <div className="flex h-full min-h-[560px] items-center justify-center">
            <div className="text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] bg-primary-soft text-primary">
                <MessageCircleMore className="h-5 w-5" />
              </span>
              <p className="mt-4 text-[12px] font-semibold text-muted">Choose a conversation to start reading.</p>
            </div>
          </div>
        ) : previewMode ? (
          <PreviewThread key={active.id} conversation={active} onBack={closeConversation} />
        ) : (
          <MessageThread
            // Remounts on switch, so thread state starts clean without
            // clearing it inside an effect.
            key={active.id}
            supabase={supabase}
            conversationId={active.id}
            currentUserId={currentUserId}
            otherUserId={active.otherUserId}
            otherUsername={active.otherUsername}
            otherTrack={active.otherTrack}
            onBack={closeConversation}
            onBlocked={() => {
              closeConversation();
              router.refresh();
            }}
            onLocalActivity={handleThreadActivity}
            onReadAll={clearUnread}
          />
        )}
      </div>
    </div>
  );
}
