"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, MicroLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrackBadge } from "@/components/ui/track-badge";
import { MessageButton } from "@/components/chat/message-button";
import type { Track, ContactType } from "@/lib/constants";

export interface ConnectedPerson {
  requestId: string;
  id: string;
  username: string | null;
  major: string | null;
  applicationYear: number | null;
  track: Track;
  contacts: { type: ContactType; value: string }[];
}

export function ConnectedList({ items: initial, fromUrl }: { items: ConnectedPerson[]; fromUrl: string }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function revoke(requestId: string) {
    const snapshot = items;
    setErrorId(null);
    setBusyId(requestId);
    // Optimistic -- remove immediately, restore + show an error on failure.
    setItems((rows) => rows.filter((r) => r.requestId !== requestId));
    try {
      const res = await fetch("/api/connections/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      if (!res.ok) {
        setItems(snapshot);
        setErrorId(requestId);
      } else {
        // Same stale-count issue as IncomingRequestsList's respond() --
        // this page's "Connected" tab count is a server-computed prop that
        // doesn't know a revoke just happened.
        router.refresh();
      }
    } catch {
      setItems(snapshot);
      setErrorId(requestId);
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
            <Link
              href={`/profile/${person.username}?from=${encodeURIComponent(fromUrl)}`}
              className="font-semibold text-ink hover:underline"
            >
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

          {/* In-app chat replaces the old Instagram/Discord contact box as the
              way connected users reach each other. The underlying contact
              methods still exist (profile Contact vault) -- they are simply no
              longer the primary contact surface here. */}
          <div className="flex items-center gap-2">
            <MessageButton otherUserId={person.id} />
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => revoke(person.requestId)}
            disabled={busyId === person.requestId}
          >
            Revoke connection
          </Button>
          {errorId === person.requestId && (
            <p className="text-[12.5px] text-red-600">Couldn&apos;t revoke. Try again.</p>
          )}
        </Card>
      ))}
    </div>
  );
}
