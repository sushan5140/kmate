"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bell } from "lucide-react";
import { MoreMenu } from "@/components/layout/more-menu";

function subscribeToHistory(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

export function TopBar({ username, isAdmin }: { username: string | null; isAdmin: boolean }) {
  const [hasUnread, setHasUnread] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const canGoBack = useSyncExternalStore(
    subscribeToHistory,
    () => window.history.length > 1,
    () => false
  );
  const showBack = canGoBack && pathname !== "/home";

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/notifications/unread-count");
        const data = await res.json();
        if (!cancelled) setHasUnread((data.count ?? 0) > 0);
      } catch {}
    }
    poll();
    const interval = setInterval(poll, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-[58px] items-center justify-between border-b border-hairline bg-surface/88 px-3 backdrop-blur-xl md:hidden">
      <div className="flex min-w-0 items-center gap-1.5">
        {showBack && (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="pressable flex h-9 w-9 items-center justify-center rounded-[11px] text-ink hover:bg-ink/[0.04]"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
        )}
        <Link href="/home" className="inline-flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-ink text-[11px] font-extrabold text-white">
            K
          </span>
          <span className="truncate text-[14px] font-extrabold tracking-[-0.02em] text-ink">KMate</span>
        </Link>
      </div>

      <div className="flex items-center gap-0.5">
        <Link
          href="/requests"
          aria-label="Notifications"
          className="pressable relative flex h-9 w-9 items-center justify-center rounded-[11px] text-ink hover:bg-ink/[0.04]"
        >
          <Bell className="h-[18px] w-[18px]" />
          {hasUnread && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-gks-u ring-2 ring-surface" />}
        </Link>
        <MoreMenu username={username} isAdmin={isAdmin} />
      </div>
    </header>
  );
}
