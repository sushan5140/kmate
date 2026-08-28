"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ShieldCheck } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav-items";
import { cn } from "@/lib/cn";

export function Sidebar({
  username,
  pendingRequestsCount,
  isAdmin,
}: {
  username: string | null;
  pendingRequestsCount: number;
  isAdmin: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[210px] flex-col border-r border-hairline bg-surface md:flex">
      {/* Pinned: the brand stays put while the nav below it scrolls. */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <button type="button" aria-label="Toggle menu" className="text-ink">
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/home" className="text-[15px] font-semibold tracking-tight text-ink">
          KMate
        </Link>
      </div>

      {/*
        The scrolling region, and the whole point of this layout.

        min-h-0 is the load-bearing part: a flex item defaults to
        min-height:auto, so `flex-1` alone let this nav grow to its content's
        full height and push past the fixed aside instead of scrolling --
        which is exactly how the lower items (Admin, Profile) became
        unreachable on shorter screens. min-h-0 lets it shrink below its
        content so overflow-y-auto has something to do.

        overscroll-contain stops the scroll chaining onward to the page once
        this list hits its end, so spinning the wheel over the sidebar never
        moves the main content.
      */}
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-3 sidebar-scroll">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const badgeCount = item.badgeKey === "requests" ? pendingRequestsCount : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted hover:bg-canvas hover:text-ink"
              )}
            >
              <span className="flex items-center gap-2.5">
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </span>
              {badgeCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gks-u px-1.5 text-[11px] font-semibold text-white">
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Pinned: Admin and Profile stay reachable at any viewport height
          without scrolling for them. shrink-0 keeps them from being squeezed
          when the nav above is long. */}
      <div className="shrink-0 px-3 pb-4">
        <div className="mb-2 border-t border-hairline" />
        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              "mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
              pathname.startsWith("/admin") ? "bg-primary/10 text-primary" : "text-muted hover:bg-canvas hover:text-ink"
            )}
          >
            <ShieldCheck className="h-[18px] w-[18px]" />
            Admin
          </Link>
        )}
        <Link
          href={username ? `/profile/${username}` : "/settings/profile"}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
            pathname.startsWith("/profile") ? "bg-primary/10 text-primary" : "text-muted hover:bg-canvas hover:text-ink"
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
            {username ? username[0]?.toUpperCase() : "?"}
          </span>
          Profile
        </Link>
      </div>
    </aside>
  );
}
