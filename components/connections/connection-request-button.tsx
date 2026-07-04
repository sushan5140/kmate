"use client";

import { useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@/components/ui/connect-button";
import { Button } from "@/components/ui/button";

export type ConnectionStatus = "none" | "pending_outgoing" | "pending_incoming" | "accepted";

interface ConnectionRequestButtonProps {
  targetUserId: string;
  initialStatus: ConnectionStatus;
  /** The connection_requests row id, when initialStatus is already accepted/pending -- needed for revoke. */
  connectionId?: string | null;
}

export function ConnectionRequestButton({
  targetUserId,
  initialStatus,
  connectionId = null,
}: ConnectionRequestButtonProps) {
  const [status, setStatus] = useState<ConnectionStatus>(initialStatus);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [pendingRequestId] = useState<string | null>(connectionId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendRequest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/connections/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: targetUserId, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "blocked"
            ? "You can't send a request to this person."
            : data.error === "request_already_pending"
            ? "A request is already pending."
            : "Couldn't send the request. Try again."
        );
        setLoading(false);
        return;
      }
      setStatus("pending_outgoing");
      setShowNote(false);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function revoke() {
    if (!pendingRequestId) return;
    setLoading(true);
    try {
      await fetch("/api/connections/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: pendingRequestId }),
      });
      setStatus("none");
    } finally {
      setLoading(false);
    }
  }

  if (status === "accepted") {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-success/10 px-3 py-1 text-[13px] font-medium text-success">
          Connected
        </span>
        {pendingRequestId && (
          <Button variant="ghost" size="sm" onClick={revoke} disabled={loading}>
            Revoke
          </Button>
        )}
      </div>
    );
  }

  if (status === "pending_outgoing") {
    return <span className="text-[13px] text-muted">Request sent — waiting for a reply.</span>;
  }

  if (status === "pending_incoming") {
    return (
      <Link href="/requests" className="text-[13px] font-medium text-primary hover:underline">
        They sent you a request — respond in Requests
      </Link>
    );
  }

  return (
    <div>
      {!showNote ? (
        <ConnectButton onClick={() => setShowNote(true)} />
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 280))}
            placeholder="Add a short note (optional)"
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <ConnectButton onClick={sendRequest} disabled={loading}>
              {loading ? "Sending…" : "Send request"}
            </ConnectButton>
            <Button variant="ghost" size="sm" onClick={() => setShowNote(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-1.5 text-[12.5px] text-red-600">{error}</p>}
    </div>
  );
}
