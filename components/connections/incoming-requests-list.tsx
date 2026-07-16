"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface IncomingRequestRow {
  id: string;
  note: string | null;
  otherUser: { id: string; username: string | null };
}

export function IncomingRequestsList({ items: initial }: { items: IncomingRequestRow[] }) {
  const [items, setItems] = useState(initial);
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
        setItems((rows) => rows.filter((r) => r.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-[13.5px] text-muted">No incoming requests right now.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((r) => (
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
            <Button size="sm" variant="secondary" onClick={() => respond(r.id, "decline")} disabled={busyId === r.id}>
              Decline
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
