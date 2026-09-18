"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/card";
import { TrackBadge } from "@/components/ui/track-badge";
import { MessageActions } from "@/components/chat/message-actions";
import { ensureRealtimeAuth } from "@/lib/supabase/browser-client";
import type { Track } from "@/lib/constants";

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

/** Matches the DB check constraint on messages.body. */
const MAX_BODY = 5000;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * One open conversation. Mounted with key={conversationId} by ChatApp, so
 * switching threads remounts this with empty state rather than clearing state
 * inside an effect (which would cascade renders).
 */
export function MessageThread({
  supabase,
  conversationId,
  currentUserId,
  otherUserId,
  otherUsername,
  otherTrack,
  onBack,
  onBlocked,
  onLocalActivity,
  onReadAll,
}: {
  supabase: SupabaseClient;
  conversationId: string;
  currentUserId: string;
  otherUserId: string;
  otherUsername: string | null;
  otherTrack: Track | null;
  onBack: () => void;
  onBlocked: () => void;
  /** Bubbles a new message up so the conversation list preview stays in sync. */
  onLocalActivity: (msg: ChatMessage) => void;
  onReadAll: (conversationId: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const markRead = useCallback(async () => {
    // messages_update_read_receipt only permits the RECIPIENT to update,
    // hence the sender_id filter -- a blanket update would be rejected.
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .neq("sender_id", currentUserId)
      .is("read_at", null);
    onReadAll(conversationId);
  }, [supabase, conversationId, currentUserId, onReadAll]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: loadError } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, read_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (cancelled) return;
      if (loadError) setError("Couldn't load this conversation.");
      else {
        setMessages((data ?? []) as ChatMessage[]);
        void markRead();
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, conversationId, markRead]);

  // Realtime, scoped to this conversation. RLS (messages_select_participant)
  // still applies to postgres_changes, so this only ever receives rows the
  // viewer is allowed to read.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Must come BEFORE subscribe(): an unauthenticated socket is silently
      // starved by RLS -- it reports SUBSCRIBED and then delivers nothing.
      await ensureRealtimeAuth(supabase);
      if (cancelled) return;

      channel = supabase
        .channel(`chat:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const msg = payload.new as ChatMessage;
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
            onLocalActivity(msg);
            if (msg.sender_id !== currentUserId) void markRead();
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, conversationId, currentUserId, markRead, onLocalActivity]);

  useEffect(() => {
    if (messages.length) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);

    const { data, error: sendError } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: currentUserId, body })
      .select("id, conversation_id, sender_id, body, created_at, read_at")
      .single();

    if (sendError) {
      // Both the RLS insert policy and on_messages_guard reject a send once
      // either side has blocked the other.
      setError(
        /block/i.test(sendError.message)
          ? "You can't message this person — one of you has blocked the other."
          : "Couldn't send. Try again."
      );
    } else if (data) {
      const msg = data as ChatMessage;
      setDraft("");
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      onLocalActivity(msg);
    }
    setSending(false);
  }

  return (
    <Card className="flex h-[70vh] flex-col p-0">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
        <button type="button" onClick={onBack} aria-label="Back to conversations" className="md:hidden">
          <ArrowLeft className="h-4 w-4 text-muted" />
        </button>
        <Link
          href={`/profile/${otherUsername ?? ""}`}
          className="text-[14.5px] font-semibold text-ink hover:underline"
        >
          @{otherUsername ?? "unknown"}
        </Link>
        {otherTrack && <TrackBadge track={otherTrack} />}
        <span className="ml-auto">
          <MessageActions blockedUserId={otherUserId} onBlocked={onBlocked} />
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-[13px] text-muted">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-[13px] text-muted">No messages yet — say hello.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {messages.map((m) => {
              const mine = m.sender_id === currentUserId;
              return (
                <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className="group max-w-[78%]">
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed ${
                        mine ? "bg-primary text-white" : "bg-canvas text-ink"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                    <div
                      className={`mt-0.5 flex items-center gap-2 text-[11px] text-muted ${
                        mine ? "justify-end" : "justify-start"
                      }`}
                    >
                      <span>{formatTime(m.created_at)}</span>
                      {mine && m.read_at && <span>Read</span>}
                      {!mine && (
                        <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <MessageActions messageId={m.id} />
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-4 pb-1 text-[12.5px] text-red-600">{error}</p>}

      <div className="flex items-end gap-2 border-t border-hairline px-3 py-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Write a message…"
          className="max-h-32 flex-1 resize-y rounded-xl border border-hairline-strong bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !draft.trim()}
          aria-label="Send message"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-all hover:bg-ink/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}
