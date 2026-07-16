"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, ShieldCheck, Flag, Info, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/ui/button";

function ReportProblemForm({ onDone }: { onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (reason.trim().length < 3) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "app", targetId: "self", reason }),
      });
      if (res.ok) setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return <p className="px-4 py-3 text-[13px] text-success">Thanks -- we&apos;ll take a look.</p>;
  }

  return (
    <div className="px-4 py-3">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 500))}
        placeholder="What went wrong?"
        rows={3}
        autoFocus
        className="w-full resize-none rounded-lg border border-border px-2.5 py-2 text-[13px] outline-none focus:border-primary"
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={submitting || reason.trim().length < 3}>
          Submit
        </Button>
      </div>
    </div>
  );
}

function MoreMenuContent({ username, onNavigate }: { username: string | null; onNavigate: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"menu" | "report">("menu");

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (mode === "report") {
    return <ReportProblemForm onDone={() => setMode("menu")} />;
  }

  return (
    <div className="py-1.5">
      <div className="pb-1">
        <span className="mx-4 mt-1.5 block h-1 w-9 rounded-full bg-ink/10 md:hidden" />
      </div>
      <Link
        href={username ? `/profile/${username}` : "/settings/profile"}
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-canvas"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-white">
          {username ? username[0]?.toUpperCase() : "?"}
        </span>
        <span className="text-[13.5px] font-medium text-ink">
          {username ? `@${username}` : "Your profile"}
        </span>
      </Link>

      <Link href="/guidelines" onClick={onNavigate} className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] text-ink hover:bg-canvas">
        <ShieldCheck className="h-4 w-4 text-muted" /> Community guidelines
      </Link>
      <button
        type="button"
        onClick={() => setMode("report")}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13.5px] text-ink hover:bg-canvas"
      >
        <Flag className="h-4 w-4 text-muted" /> Report a problem
      </button>
      <Link href="/about" onClick={onNavigate} className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] text-ink hover:bg-canvas">
        <Info className="h-4 w-4 text-muted" /> About KMate
      </Link>

      <div className="my-1.5 border-t border-hairline" />

      <button
        type="button"
        onClick={signOut}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13.5px] font-medium text-danger hover:bg-danger-soft"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}

export function MoreMenu({ username }: { username: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More"
        className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-canvas"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open && (
        <>
          {/*
            Mobile sheet is portaled to document.body: the trigger lives inside
            TopBar's <header backdrop-blur-md>, and backdrop-filter on an
            ancestor makes that ancestor the containing block for `fixed`
            descendants (same as `filter`/`transform`) -- without the portal,
            "fixed inset-0" resolves against the 56px header, not the viewport.
          */}
          {createPortal(
            <div className="fixed inset-0 z-50 md:hidden" onClick={() => setOpen(false)}>
              <div className="absolute inset-0 bg-ink/30" />
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-card"
              >
                <MoreMenuContent username={username} onNavigate={() => setOpen(false)} />
              </div>
            </div>,
            document.body
          )}

          {/* Desktop: anchored dropdown, top-right of the trigger (not portaled -- its trigger isn't inside a backdrop-filter ancestor) */}
          <div className="absolute right-0 top-full z-50 mt-2 hidden w-[220px] rounded-xl border border-border bg-white shadow-card md:block">
            <MoreMenuContent username={username} onNavigate={() => setOpen(false)} />
          </div>

          {/* Desktop click-outside catcher (invisible, no backdrop dimming) */}
          <div className="fixed inset-0 z-40 hidden md:block" onClick={() => setOpen(false)} />
        </>
      )}
    </div>
  );
}
