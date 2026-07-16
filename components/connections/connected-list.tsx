"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, MicroLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrackBadge } from "@/components/ui/track-badge";
import { CONTACT_TYPE_ACTION_LABELS, type Track, type ContactType } from "@/lib/constants";

export interface ConnectedPerson {
  requestId: string;
  id: string;
  username: string | null;
  major: string | null;
  applicationYear: number | null;
  track: Track;
  contacts: { type: ContactType; value: string }[];
}

export function ConnectedList({ items: initial }: { items: ConnectedPerson[] }) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function revoke(requestId: string) {
    setBusyId(requestId);
    try {
      const res = await fetch("/api/connections/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      if (res.ok) {
        setItems((rows) => rows.filter((r) => r.requestId !== requestId));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-[13.5px] text-muted">No connections yet -- accepted requests show up here.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((person) => (
        <Card key={person.id} className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/profile/${person.username}`} className="font-semibold text-ink hover:underline">
              @{person.username}
            </Link>
            <TrackBadge track={person.track} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <MicroLabel>Major</MicroLabel>
              <p className="mt-0.5 truncate text-[13px] text-ink">{person.major ?? "—"}</p>
            </div>
            <div>
              <MicroLabel>Year</MicroLabel>
              <p className="mt-0.5 text-[13px] text-ink">{person.applicationYear ?? "—"}</p>
            </div>
          </div>

          {person.contacts.length > 0 && (
            <div className="rounded-xl border border-border bg-canvas/60 p-3">
              <MicroLabel>Contact</MicroLabel>
              <ul className="mt-1.5 flex flex-col gap-1">
                {person.contacts.map((c) => (
                  <li key={c.type} className="text-[13px] text-ink">
                    <span className="font-medium">{CONTACT_TYPE_ACTION_LABELS[c.type]}</span>{" "}
                    <span className="text-muted">· {c.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => revoke(person.requestId)}
            disabled={busyId === person.requestId}
          >
            Revoke connection
          </Button>
        </Card>
      ))}
    </div>
  );
}
