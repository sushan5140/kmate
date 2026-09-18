"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ShieldCheck } from "lucide-react";
import {
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  navItemsByGroup,
  type NavGroup,
} from "@/lib/nav-items";
import { cn } from "@/lib/cn";

const GROUP_TONES: Record<NavGroup, { icon: string; label: string }> = {
  overview: {
    icon: "bg-ink/[0.05] text-ink/65",
    label: "text-muted/55",
  },
  application: {
    icon: "bg-primary-soft text-primary",
    label: "text-primary/70",
  },
  resources: {
    icon: "bg-gold-soft text-gold",
    label: "text-gold/80",
  },
  preparation: {
    icon: "bg-gks-u/10 text-gks-u",
    label: "text-gks-u/80",
  },
  community: {
    icon: "bg-gks-g/10 text-gks-g",
    label: "text-gks-g/80",
  },
};

export function Sidebar({
  username,
  pendingRequestsCount,
  isAdmin,
  demoMode = false,
}: {
  username: string | null;
  pendingRequestsCount: number;
  isAdmin: boolean;
  demoMode?: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-hairline bg-surface/92 backdrop-blur-xl md:flex">
      <div className="flex h-[76px] shrink-0 items-center px-5">
        <Link href="/home" className="group inline-flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary text-[13px] font-extrabold text-white shadow-xs transition-transform duration-150 ease-out group-active:scale-[0.96]">
            K
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-gks-u" />
          </span>
          <span>
            <span className="block text-[15px] font-extrabold tracking-[-0.025em] text-ink">KMate</span>
            <span className="block text-[10px] font-semibold tracking-[0.02em] text-muted">GKS workspace</span>
          </span>
        </Link>
      </div>

      <nav className="sidebar-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-4">
        {NAV_GROUP_ORDER.map((group, groupIndex) => {
          const items = navItemsByGroup(group);
          if (!items.length) return null;
          const tone = GROUP_TONES[group];

          return (
            <div key={group} className={cn(groupIndex > 0 && "mt-5")}>
              {group !== "overview" && (
                <p className={cn("mb-1.5 px-3 text-[9.5px] font-extrabold uppercase tracking-[0.14em]", tone.label)}>
                  {NAV_GROUP_LABELS[group]}
                </p>
              )}

              <div className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const badgeCount = item.badgeKey === "requests" ? pendingRequestsCount : 0;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group flex min-h-11 items-center justify-between gap-2 rounded-[13px] px-2.5 py-2 text-[12.75px] font-semibold transition-[background-color,color,transform,box-shadow] duration-150 ease-out active:scale-[0.985]",
                        active
                          ? "bg-primary text-white shadow-[0_8px_22px_-15px_rgba(27,110,91,.9)]"
                          : "text-muted hover:bg-white hover:text-ink hover:shadow-xs"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] transition-[background-color,color] duration-150",
                            active ? "bg-white/14 text-white" : tone.icon
                          )}
                        >
                          <item.icon className="h-[15px] w-[15px]" />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </span>

                      {badgeCount > 0 ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gks-u px-1.5 text-[10px] font-extrabold text-white">
                          {badgeCount > 9 ? "9+" : badgeCount}
                        </span>
                      ) : (
                        active && <ChevronRight className="h-3.5 w-3.5 text-white/55" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 p-3">
        <div className="rounded-[18px] border border-hairline bg-canvas/68 p-2">
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "mb-1 flex items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-[12.5px] font-semibold transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-primary-soft text-primary"
                  : "text-muted hover:bg-white hover:text-ink"
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              Admin
            </Link>
          )}

          {demoMode ? (
            <div className="flex items-center gap-2.5 rounded-[12px] px-2 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gks-g/10 text-[11px] font-extrabold text-gks-g ring-1 ring-gks-g/15">
                R
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-bold text-ink">Raw preview</span>
                <span className="block text-[10px] font-medium text-muted">No account required</span>
              </span>
            </div>
          ) : (
            <Link
              href={username ? `/profile/${username}` : "/settings/profile"}
              className="flex items-center gap-2.5 rounded-[12px] px-2 py-2 transition-colors hover:bg-white"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-[11px] font-extrabold text-white">
                {username ? username[0]?.toUpperCase() : "?"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-bold text-ink">
                  {username ? `@${username}` : "Your profile"}
                </span>
                <span className="block text-[10px] font-medium text-muted">Account & settings</span>
              </span>
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
