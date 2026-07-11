"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Home, Bell } from "lucide-react";
import { MoreMenu } from "@/components/layout/more-menu";

export function TopBar({ username }: { username: string | null }) {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/notifications/unread-count");
        const data = await res.json();
        if (!cancelled) setHasUnread((data.count ?? 0) > 0);
      } catch {
        // Best-effort -- leave the last known state on a failed poll.
      }
    }
    poll();
    const interval = setInterval(poll, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-surface/90 px-4 backdrop-blur-md md:hidden">
      <Link href="/home" className="text-[15px] font-semibold tracking-tight text-ink">
        KMate
      </Link>
      <div className="flex items-center gap-1">
        <Link
          href="/home"
          aria-label="Home"
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-canvas"
        >
          <Home className="h-[19px] w-[19px]" />
        </Link>
        <Link
          href="/requests"
          aria-label="Notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-canvas"
        >
          <Bell className="h-[19px] w-[19px]" />
          {hasUnread && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />}
        </Link>
        <MoreMenu username={username} />
      </div>
    </header>
  );
}
