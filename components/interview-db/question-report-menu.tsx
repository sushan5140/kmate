"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Reporting a question is still possible, just no longer a default-visible
 * button on every card -- right-click (long-press has the same effect on
 * touch browsers, which fire contextmenu on long-press) reveals it instead.
 * Wraps the card rather than replacing ReportBlockMenu, since that
 * component's always-visible "..." trigger is still the right pattern for
 * profile reporting elsewhere and shouldn't change.
 */
export function QuestionReportMenu({ questionId, children }: { questionId: string; children: React.ReactNode }) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<"menu" | "report">("menu");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function open(e: React.MouseEvent) {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMode("menu");
    setDone(false);
    setReason("");
  }

  function close() {
    setMenuPos(null);
  }

  useEffect(() => {
    if (!menuPos) return;
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuPos]);

  async function submitReport() {
    if (reason.trim().length < 3) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "question", targetId: questionId, reason }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(close, 1200);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div onContextMenu={open}>
      {children}
      {menuPos && (
        <div
          ref={menuRef}
          style={{ position: "fixed", left: menuPos.x, top: menuPos.y }}
          className="z-50 rounded-lg border border-border bg-white shadow-card"
        >
          {done ? (
            <p className="px-3 py-2 text-[13px] text-muted">Reported.</p>
          ) : mode === "menu" ? (
            <button
              type="button"
              onClick={() => setMode("report")}
              className="block w-full px-3 py-2 text-left text-[13px] text-ink hover:bg-canvas"
            >
              Report this question
            </button>
          ) : (
            <div className="w-64 p-3">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 500))}
                placeholder="What's wrong?"
                rows={3}
                autoFocus
                className="w-full resize-none rounded-lg border border-border px-2 py-1.5 text-[13px] outline-none focus:border-primary"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={close}>
                  Cancel
                </Button>
                <Button size="sm" onClick={submitReport} disabled={submitting || reason.trim().length < 3}>
                  Submit
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
