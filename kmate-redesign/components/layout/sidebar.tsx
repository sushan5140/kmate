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
  overview: { icon: "bg-white/[0.07] text-white/72", label: "text-white/40" },
  application: { icon: "bg-[#74c8ad]/12 text-[#8ed7c0]", label: "text-[#8ed7c0]/70" },
  resources: { icon: "bg-[#ddb062]/12 text-[#e5bd75]", label: "text-[#e5bd75]/72" },
  preparation: { icon: "bg-[#e69a7d]/12 text-[#efa98f]", label: "text-[#efa98f]/72" },
  community: { icon: "bg-[#8da0e0]/12 text-[#a5b4ea]", label: "text-[#a5b4ea]/72" },
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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-white/[0.06] bg-[#12372d] md:flex">
      <div className="flex h-[78px] shrink-0 items-center px-5">
        <Link href="/home" className="group inline-flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-[13px] font-black text-[#12372d] shadow-xs transition-transform duration-150 ease-out group-active:scale-[0.96]">
            K
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#12372d] bg-gks-u" />
          </span>
          <span>
            <span className="block text-[15px] font-extrabold tracking-[-0.025em] text-white">KMate</span>
            <span className="block text-[10px] font-semibold tracking-[0.03em] text-white/45">GKS workspace</span>
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
                <p className={cn("mb-1.5 px-3 text-[9px] font-extrabold uppercase tracking-[0.16em]", tone.label)}>
                  {NAV_GROUP_LABELS[group]}
                </p>
              )}

              <div className="flex flex-col gap-1">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const badgeCount = item.badgeKey === "requests" ? pendingRequestsCount : 0;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group flex min-h-11 items-center justify-between gap-2 rounded-[11px] px-2.5 py-2 text-[12.5px] font-semibold transition-[background-color,color,transform,box-shadow] duration-150 ease-out active:scale-[0.985]",
                        active
                          ? "bg-white text-[#12372d] shadow-[0_10px_24px_-16px_rgba(0,0,0,.65)]"
                          : "text-white/68 hover:bg-white/[0.07] hover:text-white"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] transition-[background-color,color] duration-150",
                            active ? "bg-primary-soft text-primary" : tone.icon
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
                        active && <ChevronRight className="h-3.5 w-3.5 text-[#12372d]/38" />
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
        <div className="rounded-[14px] border border-white/[0.08] bg-white/[0.045] p-2">
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "mb-1 flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[12px] font-semibold transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-white text-[#12372d]"
                  : "text-white/60 hover:bg-white/[0.07] hover:text-white"
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              Admin
            </Link>
          )}

          {demoMode ? (
            <div className="flex items-center gap-2.5 rounded-[10px] px-2 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#8da0e0]/14 text-[11px] font-extrabold text-[#b9c6f1]">
                R
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-bold text-white">Raw preview</span>
                <span className="block text-[9.5px] font-medium text-white/42">No account required</span>
              </span>
            </div>
          ) : (
            <Link
              href={username ? `/profile/${username}` : "/settings/profile"}
              className="flex items-center gap-2.5 rounded-[10px] px-2 py-2 transition-colors hover:bg-white/[0.07]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-white text-[11px] font-extrabold text-[#12372d]">
                {username ? username[0]?.toUpperCase() : "?"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-bold text-white">
                  {username ? `@${username}` : "Your profile"}
                </span>
                <span className="block text-[9.5px] font-medium text-white/42">Account & settings</span>
              </span>
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
