"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Home, Bell } from "lucide-react";
import { MoreMenu } from "@/components/layout/more-menu";

// history.length is a browser value with no server equivalent, so it's read
// through useSyncExternalStore rather than an effect: the server snapshot is
// `false` (button absent in the SSR'd HTML, so no hydration mismatch) and the
// client re-reads on every render -- including the re-render a route change
// causes -- so the stack depth stays current as you drill in and back out.
function subscribeToHistory(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

export function TopBar({ username, isAdmin }: { username: string | null; isAdmin: boolean }) {
  const [hasUnread, setHasUnread] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Desktop always has the sidebar, so every destination is one click away and
  // a back control is redundant there. Mobile has no sidebar (see
  // components/layout/sidebar.tsx, md:flex only), which left the only way back
  // as the browser chrome -- absent entirely when KMate is installed to the
  // home screen.
  const canGoBack = useSyncExternalStore(
    subscribeToHistory,
    () => window.history.length > 1,
    () => false
  );

  // /home is the root of the app -- nothing above it to step back to.
  const showBack = canGoBack && pathname !== "/home";

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
      <div className="flex items-center gap-1">
        {showBack && (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-canvas"
          >
            <ArrowLeft className="h-[19px] w-[19px]" />
          </button>
        )}
        <Link href="/home" className="text-[15px] font-semibold tracking-tight text-ink">
          KMate
        </Link>
      </div>
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
        <MoreMenu username={username} isAdmin={isAdmin} />
      </div>
    </header>
  );
}
