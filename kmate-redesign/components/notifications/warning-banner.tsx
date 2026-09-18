"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface NotificationRow {
  id: string;
  type: string;
  payload: { reason?: string };
  read_at: string | null;
}

// The notifications table already has a GET (list) and POST (mark-read)
// route -- neither was ever called from anywhere in the app before the
// admin "Warn submitter" action needed a way to actually show its message.
// This filters client-side for the one type it cares about rather than
// adding query params to that shared route, since it's the only consumer
// so far and the list is capped at 30 rows anyway.
export function WarningBanner() {
  const [warnings, setWarnings] = useState<NotificationRow[]>([]);
  const [dismissing, setDismissing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const unreadWarnings = ((data.notifications ?? []) as NotificationRow[]).filter(
          (n) => n.type === "admin_warning" && !n.read_at
        );
        setWarnings(unreadWarnings);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function dismiss(id: string) {
    setDismissing(id);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setWarnings((rows) => rows.filter((r) => r.id !== id));
      }
    } finally {
      setDismissing(null);
    }
  }

  if (warnings.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {warnings.map((w) => (
        <div key={w.id} className="flex items-start gap-3 rounded-2xl bg-gold-soft px-5 py-4 ring-1 ring-gold/25">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-gold">Notice from KMate</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink">
              {w.payload.reason ?? "Please review our community guidelines."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(w.id)}
            disabled={dismissing === w.id}
            aria-label="Dismiss"
            className="text-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
