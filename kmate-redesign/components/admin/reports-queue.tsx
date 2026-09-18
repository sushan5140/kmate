"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserIdentityRow, type Identity } from "@/components/admin/user-identity-row";

export type ReportTargetType = "profile" | "question" | "eca" | "mistake" | "app";

export interface ReportItem {
  id: string;
  reason: string;
  targetType: ReportTargetType;
  /** Title/text of the reported content, when target_type points at a piece of content rather than a profile. */
  snippet: string | null;
  reporter: Identity | null;
  /** The profile behind the report -- reported user directly (target_type='profile'), or the submitter of the reported content. Null for 'app' feedback, or if the content/submitter no longer exists. */
  target: Identity | null;
}

const TARGET_TYPE_LABELS: Record<ReportTargetType, string> = {
  profile: "Reported profile",
  question: "Reported interview question",
  eca: "Reported extracurricular",
  mistake: "Reported mistake entry",
  app: "General app feedback",
};

export function ReportsQueue({ items: initial }: { items: ReportItem[] }) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function resolve(id: string, action: "reviewed" | "dismissed") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/reports/${id}/moderate`, {
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
    return <p className="text-[14px] text-muted">No open reports.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <Card key={item.id} className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {TARGET_TYPE_LABELS[item.targetType]}
              </span>
              <p className="mt-0.5 text-[14px] text-ink">{item.reason}</p>
              {item.snippet && <p className="mt-1 text-[12.5px] italic text-muted">&quot;{item.snippet}&quot;</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={() => resolve(item.id, "reviewed")} disabled={busyId === item.id}>
                Mark reviewed
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => resolve(item.id, "dismissed")}
                disabled={busyId === item.id}
              >
                Dismiss
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-hairline pt-2.5">
            {item.reporter ? (
              <UserIdentityRow identity={item.reporter} label="Reporter" />
            ) : (
              <p className="text-[12.5px] text-muted">Reporter: account no longer exists.</p>
            )}
            {item.target && <UserIdentityRow identity={item.target} label="Reported" />}
            {!item.target && item.targetType !== "app" && (
              <p className="text-[12.5px] text-muted">Reported content or submitter no longer exists.</p>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
