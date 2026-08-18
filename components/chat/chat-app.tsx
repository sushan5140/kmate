"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient, ensureRealtimeAuth } from "@/lib/supabase/browser-client";
import { Card } from "@/components/ui/card";
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
      <Card>
        <p className="text-[13.5px] text-muted">
          No conversations yet. Start one from{" "}
          <Link href="/requests?tab=connected" className="font-medium text-primary hover:underline">
            your connections
          </Link>
          .
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      {/* On mobile the list gives way to the open thread; on md+ both show. */}
      <div className={activeId ? "hidden md:block" : "block"}>
        <Card className="p-0">
          <ul className="divide-y divide-hairline">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openConversation(c.id)}
                  className={`flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-canvas ${
                    c.id === activeId ? "bg-canvas" : ""
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-medium text-ink">
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
                  <span className="truncate text-[12.5px] text-muted">
                    {c.lastMessageBody
                      ? `${c.lastMessageFromMe ? "You: " : ""}${c.lastMessageBody}`
                      : "No messages yet"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className={activeId ? "block" : "hidden md:block"}>
        {!active ? (
          <Card className="flex h-[70vh] items-center justify-center">
            <p className="text-[13.5px] text-muted">Select a conversation to start reading.</p>
          </Card>
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
