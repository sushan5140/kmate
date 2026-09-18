"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient, ensureRealtimeAuth } from "@/lib/supabase/browser-client";
import { Card } from "@/components/ui/card";
import { MessageCircleMore } from "lucide-react";
import { MessageThread, type ChatMessage } from "@/components/chat/message-thread";
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

export function ChatApp({
  currentUserId,
  conversations: initialConversations,
  initialActiveId,
}: {
  currentUserId: string;
  conversations: ConversationSummary[];
  initialActiveId: string | null;
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
  }, [supabase, applyMessageToList]);

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
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted/70">Conversations</p>
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
