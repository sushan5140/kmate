"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ShieldCheck } from "lucide-react";
import {
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  navItemsByGroup,
} from "@/lib/nav-items";
import { cn } from "@/lib/cn";

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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-white/[0.06] bg-ink md:flex">
      <div className="flex h-[78px] shrink-0 items-center px-5">
        <Link href="/home" className="group inline-flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-[9px] bg-white text-[13px] font-black text-ink transition-transform duration-150 ease-out group-active:scale-[0.975]">
            K
            <span className="absolute inset-x-1.5 bottom-1 h-[2px] rounded-full bg-gks-u" />
          </span>
          <span>
            <span className="block text-[15px] font-extrabold tracking-[-0.025em] text-white">KMate</span>
            <span className="block text-[10.5px] font-medium text-white/42">GKS application desk</span>
          </span>
        </Link>
      </div>

      <nav className="sidebar-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-4">
        {NAV_GROUP_ORDER.map((group, groupIndex) => {
          const items = navItemsByGroup(group);
          if (!items.length) return null;

          return (
            <div key={group} className={cn(groupIndex > 0 && "mt-5")}>
              {group !== "overview" && (
                <p className="mb-1.5 px-3 text-[11px] font-semibold text-white/38">
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
                        "group relative flex min-h-11 items-center justify-between gap-2 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.985]",
                        active
                          ? "bg-white/[0.085] text-white"
                          : "text-white/58 hover:bg-white/[0.05] hover:text-white/92"
                      )}
                    >
                      {active && <span className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-primary" />}
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center", active ? "text-white" : "text-white/42")}>
                          <item.icon className="h-[16px] w-[16px]" />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </span>

                      {badgeCount > 0 ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gks-u px-1.5 text-[10px] font-extrabold text-white">
                          {badgeCount > 9 ? "9+" : badgeCount}
                        </span>
                      ) : (
                        active && <ChevronRight className="h-3.5 w-3.5 text-white/32" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-white/[0.06] p-3">
        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              "mb-1 flex min-h-11 items-center gap-2.5 rounded-[9px] px-3 text-[12px] font-semibold transition-colors",
              pathname.startsWith("/admin")
                ? "bg-white/[0.085] text-white"
                : "text-white/55 hover:bg-white/[0.05] hover:text-white"
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            Admin
          </Link>
        )}

        {demoMode ? (
          <div className="flex min-h-11 items-center gap-2.5 rounded-[9px] px-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-white/10 text-[11px] font-extrabold text-white/72">
              R
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-bold text-white">Raw preview</span>
              <span className="block text-[10px] font-medium text-white/38">No account required</span>
            </span>
          </div>
        ) : (
          <Link
            href={username ? `/profile/${username}` : "/settings/profile"}
            className="flex min-h-11 items-center gap-2.5 rounded-[9px] px-3 transition-colors hover:bg-white/[0.05]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-white/10 text-[11px] font-extrabold text-white">
              {username ? username[0]?.toUpperCase() : "?"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-bold text-white">
                {username ? `@${username}` : "Your profile"}
              </span>
              <span className="block text-[10px] font-medium text-white/38">Account & settings</span>
            </span>
          </Link>
        )}
      </div>
    </aside>
  );
}
