import Link from "next/link";
import { cn } from "@/lib/cn";

export type ConnectionsTab = "received" | "connected" | "sent" | "discover";

const TABS: { key: ConnectionsTab; label: string }[] = [
  { key: "received", label: "Requests received" },
  { key: "connected", label: "Connected" },
  { key: "sent", label: "Requests sent" },
  { key: "discover", label: "Discover new" },
];

export function ConnectionsTabBar({
  active,
  receivedCount,
}: {
  active: ConnectionsTab;
  receivedCount: number;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="inline-flex min-w-max items-center gap-1 rounded-[11px] border border-border bg-white p-1 shadow-xs">
        {TABS.map((t) => {
          const count = t.key === "received" ? receivedCount : null;

          return (
            <Link
              key={t.key}
              href={`/requests?tab=${t.key}`}
              className={cn(
                "pressable rounded-[8px] px-3 py-2 text-[10.5px] font-extrabold",
                active === t.key
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:bg-primary-soft hover:text-primary"
              )}
            >
              {t.label}
              {count !== null && count > 0 && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    active === t.key ? "bg-white/15 text-white" : "bg-gks-u/10 text-gks-u"
                  )}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
