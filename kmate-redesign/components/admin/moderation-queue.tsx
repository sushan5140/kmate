"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserIdentityRow } from "@/components/admin/user-identity-row";

export interface ModerationSubmitter {
  id: string;
  username: string | null;
  email: string | null;
  approvedCount: number;
  rejectedCount: number;
}

export interface ModerationItem {
  id: string;
  primaryText: string;
  secondaryText?: string;
  /** null when submitted_by is null on the row (no submitter to show/warn). */
  submitter: ModerationSubmitter | null;
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
  const [warnOpenId, setWarnOpenId] = useState<string | null>(null);
  const [warnReason, setWarnReason] = useState("");
  const [warnSentId, setWarnSentId] = useState<string | null>(null);
  const [warnBusy, setWarnBusy] = useState(false);

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

  async function sendWarning(itemId: string, userId: string) {
    if (!warnReason.trim()) return;
    setWarnBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/warn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: warnReason.trim() }),
      });
      if (res.ok) {
        setWarnOpenId(null);
        setWarnReason("");
        setWarnSentId(itemId);
      }
    } finally {
      setWarnBusy(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-[14px] text-muted">Nothing pending review.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <Card key={item.id} className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
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
          </div>

          <div className="flex flex-col gap-2 border-t border-hairline pt-2.5">
            {item.submitter ? (
              <>
                <UserIdentityRow
                  identity={item.submitter}
                  extra={`${item.submitter.approvedCount} approved · ${item.submitter.rejectedCount} rejected in this queue`}
                />
                <button
                  type="button"
                  onClick={() => {
                    setWarnOpenId(warnOpenId === item.id ? null : item.id);
                    setWarnReason("");
                  }}
                  className="self-start text-[12.5px] font-medium text-gold hover:underline"
                >
                  Warn submitter
                </button>
              </>
            ) : (
              <span className="text-[12.5px] text-muted">No submitter on file for this item.</span>
            )}
          </div>

          {warnSentId === item.id && (
            <p className="text-[12.5px] text-success">Warning sent.</p>
          )}

          {warnOpenId === item.id && item.submitter && (
            <div className="flex flex-col gap-2 rounded-lg bg-canvas px-3 py-2.5">
              <textarea
                value={warnReason}
                onChange={(e) => setWarnReason(e.target.value.slice(0, 280))}
                placeholder="Why is this submitter being warned? Shown to them directly."
                rows={2}
                autoFocus
                className="w-full resize-none rounded-lg border border-hairline-strong bg-white px-2.5 py-2 text-[13px] outline-none focus:border-primary"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setWarnOpenId(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => sendWarning(item.id, item.submitter!.id)}
                  disabled={warnBusy || !warnReason.trim()}
                >
                  {warnBusy ? "Sending…" : "Send warning"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
