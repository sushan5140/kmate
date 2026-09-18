"use client";

import { useState } from "react";
import { Flag, MoreHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/ui/button";

/**
 * Two related affordances behind one small component:
 *  - `blockedUserId` set  -> the thread-header menu (block the other person)
 *  - `messageId` set      -> the per-message report control
 *
 * Blocking deliberately posts to the SAME /api/blocks route the profile Block
 * button uses, writing to the one shared `blocks` table -- a second blocking
 * path would let the two disagree.
 */
export function MessageActions({
  blockedUserId,
  messageId,
  onBlocked,
}: {
  blockedUserId?: string;
  messageId?: string;
  onBlocked?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"blocked" | "reported" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function block() {
    if (!blockedUserId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedId: blockedUserId }),
      });
      if (res.ok) {
        setDone("blocked");
        setOpen(false);
        onBlocked?.();
      } else {
        setError("Couldn't block. Try again.");
      }
    } catch {
      setError("Couldn't block. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReport() {
    if (!messageId) return;
    setBusy(true);
    setError(null);
    // Inserted straight from the browser: message_reports_insert_own already
    // requires reporter_id = auth.uid() AND that the message belongs to a
    // conversation the reporter is in, so no server route adds anything here.
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be signed in.");
      setBusy(false);
      return;
    }
    const { error: insertError } = await supabase.from("message_reports").insert({
      message_id: messageId,
      reporter_id: user.id,
      reason: reason.trim() || null,
    });
    if (insertError) {
      setError("Couldn't submit the report.");
    } else {
      setDone("reported");
      setReporting(false);
      setOpen(false);
    }
    setBusy(false);
  }

  if (done) {
    return <span className="text-[11px] text-muted">{done === "blocked" ? "Blocked." : "Reported."}</span>;
  }

  // --- per-message report control ---
  if (messageId) {
    return (
      <span className="relative">
        <button
          type="button"
          onClick={() => setReporting((v) => !v)}
          aria-label="Report this message"
          className="text-muted hover:text-ink"
        >
          <Flag className="h-3 w-3" />
        </button>
        {reporting && (
          <div className="absolute left-0 z-20 mt-1 w-60 rounded-lg border border-border bg-white p-3 shadow-card">
            <p className="text-[12px] font-medium text-ink">Report this message</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 1000))}
              placeholder="What's wrong with it? (optional)"
              rows={3}
              className="mt-1.5 w-full resize-none rounded-lg border border-border px-2 py-1.5 text-[12.5px] outline-none focus:border-primary"
            />
            {error && <p className="mt-1 text-[11.5px] text-red-600">{error}</p>}
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setReporting(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={submitReport} disabled={busy}>
                {busy ? "Sending…" : "Report"}
              </Button>
            </div>
          </div>
        )}
      </span>
    );
  }

  // --- thread-header block menu ---
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Conversation options"
        className="rounded-full p-1.5 text-muted hover:bg-canvas hover:text-ink"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-white p-1 shadow-card">
          <button
            type="button"
            onClick={block}
            disabled={busy}
            className="block w-full rounded px-3 py-2 text-left text-[13px] text-red-600 hover:bg-canvas"
          >
            Block this person
          </button>
          <p className="px-3 pb-1.5 pt-0.5 text-[11.5px] leading-snug text-muted">
            They won&apos;t be able to message you, and you won&apos;t be able to message them.
          </p>
          {error && <p className="px-3 pb-1.5 text-[11.5px] text-red-600">{error}</p>}
        </div>
      )}
    </span>
  );
}
