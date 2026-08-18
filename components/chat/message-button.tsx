"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Opens (or creates) the 1:1 conversation with one other user, then lands on
 * the Messages page with that thread open.
 *
 * Deliberately does not pre-check "are we connected / is either of us
 * blocked" -- that gate lives in the DB (on_conversations_guard plus the
 * insert policy) and is enforced by the route. This only has to render the
 * outcome, so the rule can never drift between client and database.
 */
export function MessageButton({
  otherUserId,
  variant = "secondary",
  className,
}: {
  otherUserId: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherUserId }),
      });
      const data = (await res.json()) as { conversationId?: string; error?: string };

      if (res.ok && data.conversationId) {
        router.push(`/messages?c=${data.conversationId}`);
        return;
      }
      setError(
        data.error === "blocked"
          ? "You can't message this person."
          : data.error === "not_connected"
          ? "You need an accepted connection first."
          : "Couldn't open the chat. Try again."
      );
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={className}>
      <Button variant={variant} size="sm" onClick={open} disabled={busy}>
        <MessageCircle className="h-3.5 w-3.5" />
        {busy ? "Opening…" : "Message"}
      </Button>
      {error && <p className="mt-1 text-[12px] text-red-600">{error}</p>}
    </span>
  );
}
