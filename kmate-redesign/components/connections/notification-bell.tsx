"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

export function NotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/notifications/unread-count");
        const data = await res.json();
        if (!cancelled) setCount(data.count ?? 0);
      } catch {
        // Polling is best-effort; a failed fetch just leaves the last count.
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
    <Link href="/requests" className="relative flex items-center hover:text-ink" aria-label="Notifications">
      <Bell className="h-[18px] w-[18px]" />
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
