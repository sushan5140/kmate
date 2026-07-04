"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface RequestRow {
  id: string;
  status: "pending" | "accepted" | "declined" | "revoked";
  note: string | null;
  createdAt: string;
  otherUser: { id: string; username: string | null };
}

export function RequestsList({
  incoming: initialIncoming,
  outgoing: initialOutgoing,
}: {
  incoming: RequestRow[];
  outgoing: RequestRow[];
}) {
  const [incoming, setIncoming] = useState(initialIncoming);
  const [outgoing, setOutgoing] = useState(initialOutgoing);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function respond(id: string, action: "accept" | "decline") {
    setBusyId(id);
    try {
      const res = await fetch("/api/connections/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, action }),
      });
      if (res.ok) {
        setIncoming((rows) => rows.filter((r) => r.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/connections/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id }),
      });
      if (res.ok) {
        setOutgoing((rows) =>
          rows.map((r) => (r.id === id ? { ...r, status: "revoked" } : r))
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-[15px] font-semibold text-ink">Incoming</h2>
        {incoming.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-muted">No incoming requests right now.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {incoming.map((r) => (
              <Card key={r.id} className="flex items-center justify-between gap-3">
                <div>
                  <Link href={`/profile/${r.otherUser.username}`} className="font-medium text-ink hover:underline">
                    @{r.otherUser.username}
                  </Link>
                  {r.note && <p className="mt-0.5 text-[13px] text-muted">&quot;{r.note}&quot;</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => respond(r.id, "accept")} disabled={busyId === r.id}>
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => respond(r.id, "decline")}
                    disabled={busyId === r.id}
                  >
                    Decline
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-ink">Outgoing</h2>
        {outgoing.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-muted">You haven&apos;t sent any requests yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {outgoing.map((r) => (
              <Card key={r.id} className="flex items-center justify-between gap-3">
                <div>
                  <Link href={`/profile/${r.otherUser.username}`} className="font-medium text-ink hover:underline">
                    @{r.otherUser.username}
                  </Link>
                  <p className="mt-0.5 text-[13px] capitalize text-muted">{r.status}</p>
                </div>
                {r.status === "accepted" && (
                  <Button size="sm" variant="secondary" onClick={() => revoke(r.id)} disabled={busyId === r.id}>
                    Revoke
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
