"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Owner-only "..." menu for content the signed-in user wrote.
 *
 * Only rendered when the server said this row is theirs, and the server checks
 * ownership again on the delete itself -- hiding the button is presentation,
 * not authorisation.
 *
 * The confirmation is deliberately in-place rather than a modal: deleting one
 * short reply doesn't warrant taking over the screen, but it should still take
 * two deliberate clicks.
 */
export function OwnerMenu({
  onDelete,
  label,
  mode = "delete",
}: {
  onDelete: () => Promise<void>;
  /** Used in the accessible name, e.g. "reply" or "answer". */
  label: string;
  /**
   * "delete" = your own content. "remove" = an admin acting on someone
   * else's. The wording differs deliberately: an admin should never be shown
   * "Delete" for content they don't own, because it reads like their own.
   */
  mode?: "delete" | "remove";
}) {
  const moderating = mode === "remove";
  const actionLabel = moderating ? "Remove" : "Delete";
  const prompt = moderating ? "Remove this community contribution?" : `Delete this ${label}?`;

  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocument(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setConfirming(false);
      }
    }
    document.addEventListener("mousedown", onDocument);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocument);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function remove() {
    setBusy(true);
    try {
      await onDelete();
      setOpen(false);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setConfirming(false);
        }}
        aria-label={moderating ? `Moderate this ${label}` : `More actions for your ${label}`}
        aria-expanded={open}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-ink",
          open && "bg-canvas text-ink"
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-10 min-w-[168px] rounded-xl border border-hairline bg-white p-1 shadow-card">
          {confirming ? (
            <div className="px-2 py-1.5">
              <p className="text-[12.5px] text-ink">{prompt}</p>
              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-full px-2 py-1 text-[12px] font-medium text-muted hover:bg-canvas hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="rounded-full bg-danger px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-60"
                >
                  {busy ? `${actionLabel.slice(0, -1)}ing…` : actionLabel}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium text-danger hover:bg-canvas"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
