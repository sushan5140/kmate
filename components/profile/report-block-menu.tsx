"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReportBlockMenuProps {
  targetType: "profile" | "question";
  targetId: string;
  /** Only meaningful when targetType === 'profile'. */
  blockedUserId?: string;
}

export function ReportBlockMenu({ targetType, targetId, blockedUserId }: ReportBlockMenuProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "report">("menu");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"reported" | "blocked" | null>(null);

  async function submitReport() {
    if (reason.trim().length < 3) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason }),
      });
      if (res.ok) setDone("reported");
    } finally {
      setSubmitting(false);
      setOpen(false);
      setMode("menu");
    }
  }

  async function block() {
    if (!blockedUserId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedId: blockedUserId }),
      });
      if (res.ok) setDone("blocked");
    } finally {
      setSubmitting(false);
      setOpen(false);
    }
  }

  if (done) {
    return (
      <span className="text-[12.5px] text-muted">
        {done === "reported" ? "Reported." : "Blocked."}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More options"
        className="rounded-full p-1.5 text-muted hover:bg-canvas hover:text-ink"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && mode === "menu" && (
        <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-border bg-white py-1 shadow-card">
          <button
            type="button"
            onClick={() => setMode("report")}
            className="block w-full px-3 py-2 text-left text-[13px] text-ink hover:bg-canvas"
          >
            Report
          </button>
          {blockedUserId && (
            <button
              type="button"
              onClick={block}
              disabled={submitting}
              className="block w-full px-3 py-2 text-left text-[13px] text-red-600 hover:bg-canvas"
            >
              Block
            </button>
          )}
        </div>
      )}

      {open && mode === "report" && (
        <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-border bg-white p-3 shadow-card">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder="What's wrong?"
            rows={3}
            className="w-full resize-none rounded-lg border border-border px-2 py-1.5 text-[13px] outline-none focus:border-primary"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submitReport} disabled={submitting || reason.trim().length < 3}>
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
