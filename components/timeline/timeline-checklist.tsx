"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export interface TimelineItemData {
  id: string;
  label: string;
  description: string | null;
  offsetDays: number | null;
  completed: boolean;
}

export function TimelineChecklist({ items: initial }: { items: TimelineItemData[] }) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  const completedCount = items.filter((i) => i.completed).length;
  const progressPct = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  async function toggle(item: TimelineItemData) {
    if (busyId) return;
    setBusyId(item.id);
    const nextCompleted = !item.completed;
    setItems((rows) => rows.map((r) => (r.id === item.id ? { ...r, completed: nextCompleted } : r)));
    try {
      const res = await fetch(`/api/timeline/${item.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: nextCompleted }),
      });
      if (!res.ok) {
        setItems((rows) => rows.map((r) => (r.id === item.id ? { ...r, completed: !nextCompleted } : r)));
      }
    } catch {
      setItems((rows) => rows.map((r) => (r.id === item.id ? { ...r, completed: !nextCompleted } : r)));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-medium text-ink">
          {completedCount} of {items.length} done
        </span>
        <span className="text-muted">{progressPct}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {items.map((item) => (
          <Card key={item.id} className="flex items-start gap-3 py-3.5">
            <button
              type="button"
              onClick={() => toggle(item)}
              disabled={busyId === item.id}
              aria-pressed={item.completed}
              aria-label={item.completed ? `Mark "${item.label}" as not done` : `Mark "${item.label}" as done`}
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                item.completed ? "border-primary bg-primary text-white" : "border-hairline-strong bg-white"
              )}
            >
              {item.completed && <Check className="h-3.5 w-3.5" />}
            </button>
            <div>
              <p className={cn("text-[14.5px] font-medium leading-snug", item.completed ? "text-muted line-through" : "text-ink")}>
                {item.label}
              </p>
              {item.description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{item.description}</p>}
              {item.offsetDays !== null && (
                <p className="mt-1 text-[11.5px] font-medium uppercase tracking-wide text-muted">
                  Start ~{item.offsetDays} days before applying
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
