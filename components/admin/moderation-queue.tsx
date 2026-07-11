"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface ModerationItem {
  id: string;
  primaryText: string;
  secondaryText?: string;
}

export function ModerationQueue({
  items: initial,
  endpointBase,
}: {
  items: ModerationItem[];
  /** e.g. "/api/admin/questions" -- POSTs to `${endpointBase}/${id}/moderate`. */
  endpointBase: string;
}) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function moderate(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      const res = await fetch(`${endpointBase}/${id}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setItems((rows) => rows.filter((i) => i.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-[14px] text-muted">Nothing pending review.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <Card key={item.id} className="flex items-center justify-between gap-4">
          <div>
            {item.secondaryText && (
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {item.secondaryText}
              </span>
            )}
            <p className="mt-0.5 text-[14px] text-ink">{item.primaryText}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => moderate(item.id, "approve")} disabled={busyId === item.id}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => moderate(item.id, "reject")}
              disabled={busyId === item.id}
            >
              Reject
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
