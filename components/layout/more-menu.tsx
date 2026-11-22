"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal, ShieldCheck, LockKeyhole, Flag, Info, LogOut, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/ui/button";
import { NAV_GROUP_LABELS, NAV_GROUP_ORDER, navItemsByGroup } from "@/lib/nav-items";
import { buildLoginUrl } from "@/lib/auth/safe-next";

function ReportProblemForm({ onDone }: { onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 3) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "app", targetId: "self", reason }),
      });
      if (res.ok) setDone(true);
      else setError("Couldn't submit the report. Please try again.");
    } catch {
      setError("Couldn't connect. Please try again.");
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
      {error && <p role="alert" className="mt-2 text-[12px] text-red-600">{error}</p>}
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

function MoreMenuContent({
  username,
  isAdmin,
  isGuest = false,
  onNavigate,
}: {
  username: string | null;
  isAdmin: boolean;
  isGuest?: boolean;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const signInHref = buildLoginUrl(`${pathname}${query ? `?${query}` : ""}`);
  const [mode, setMode] = useState<"menu" | "report">("menu");

  async function signOut() {
    if (isGuest) {
      window.location.assign("/guest/end");
      return;
    }
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
        href={isGuest ? signInHref : username ? `/profile/${username}` : "/settings/profile"}
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-canvas"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-white">
          {username ? username[0]?.toUpperCase() : "?"}
        </span>
        <span className="text-[13.5px] font-medium text-ink">
          {isGuest ? `Guest · ${username || "Reviewer"}` : username ? `@${username}` : "Your profile"}
        </span>
      </Link>

      {/*
        Fallback nav list -- mobile has no persistent sidebar (see
        components/layout/sidebar.tsx, md:flex only), so the "..." menu is
        the only place every feature is guaranteed reachable regardless of
        how many cards fit on /home for a given screen size. md:hidden here
        so the desktop dropdown (already redundant with the always-visible
        Sidebar) stays exactly as it was.
      */}
      <div className="max-h-[62vh] overflow-y-auto border-y border-hairline py-1 md:hidden">
        {NAV_GROUP_ORDER.map((group) => {
          const items = navItemsByGroup(group);
          if (!items.length) return null;
          return (
            <div key={group} className="py-1">
              {group !== "overview" && (
                <p className="px-4 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.13em] text-muted/60">
                  {NAV_GROUP_LABELS[group]}
                </p>
              )}
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className="flex items-center gap-2.5 px-4 py-2 text-[13.25px] text-ink hover:bg-canvas"
                >
                  <item.icon className="h-4 w-4 text-muted" /> {item.label}
                </Link>
              ))}
            </div>
          );
        })}
      </div>

      {isGuest && (
        <Link href={signInHref} onClick={onNavigate} className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] font-medium text-primary hover:bg-primary/5">
          Continue with Google — return to this page
        </Link>
      )}
      <Link href="/guidelines" onClick={onNavigate} className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] text-ink hover:bg-canvas">
        <ShieldCheck className="h-4 w-4 text-muted" /> Community guidelines
      </Link>
      <Link href="/privacy" onClick={onNavigate} className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] text-ink hover:bg-canvas">
        <Info className="h-4 w-4 text-muted" /> Privacy & data use
      </Link>
      {isAdmin && (
        <Link href="/admin" onClick={onNavigate} className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] text-ink hover:bg-canvas">
          <LockKeyhole className="h-4 w-4 text-muted" /> Admin panel
        </Link>
      )}
      {!isGuest && (
      <button
        type="button"
        onClick={() => setMode("report")}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13.5px] text-ink hover:bg-canvas"
      >
        <Flag className="h-4 w-4 text-muted" /> Report a problem
      </button>
      )}
      <Link href="/about" onClick={onNavigate} className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] text-ink hover:bg-canvas">
        <Info className="h-4 w-4 text-muted" /> About KMate
      </Link>

      <div className="my-1.5 border-t border-hairline" />

      <button
        type="button"
        onClick={signOut}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13.5px] font-medium text-danger hover:bg-danger-soft"
      >
        <LogOut className="h-4 w-4" /> {isGuest ? "Exit Guest Mode" : "Sign out"}
      </button>
    </div>
  );
}

export function MoreMenu({ username, isAdmin = false, isGuest = false }: { username: string | null; isAdmin?: boolean; isGuest?: boolean }) {
  const [open, setOpen] = useState(false);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const panel = mobilePanelRef.current;
    const originalOverflow = document.body.style.overflow;

    if (isMobile) {
      document.body.style.overflow = "hidden";
      panel?.querySelector<HTMLElement>("button, a[href]")?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (!isMobile || event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled])'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (isMobile) document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More navigation"
        aria-expanded={open}
        aria-haspopup="dialog"
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
                ref={mobilePanelRef}
                role="dialog"
                aria-modal="true"
                aria-label="KMate navigation"
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-card"
              >
                <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
                  <p className="text-[13px] font-semibold text-ink">KMate navigation</p>
                  <button type="button" aria-label="Close navigation" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}
                    className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-canvas">
                    <X className="h-[18px] w-[18px]" aria-hidden />
                  </button>
                </div>
                <MoreMenuContent username={username} isAdmin={isAdmin} isGuest={isGuest} onNavigate={() => setOpen(false)} />
              </div>
            </div>,
            document.body
          )}

          {/* Desktop: anchored dropdown, top-right of the trigger (not portaled -- its trigger isn't inside a backdrop-filter ancestor) */}
          <div className="absolute right-0 top-full z-50 mt-2 hidden w-[220px] rounded-xl border border-border bg-white shadow-card md:block">
            <MoreMenuContent username={username} isAdmin={isAdmin} isGuest={isGuest} onNavigate={() => setOpen(false)} />
          </div>

          {/* Desktop click-outside catcher (invisible, no backdrop dimming) */}
          <div className="fixed inset-0 z-40 hidden md:block" onClick={() => setOpen(false)} />
        </>
      )}
    </div>
  );
}
