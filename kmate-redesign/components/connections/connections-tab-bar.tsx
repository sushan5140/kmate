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
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="inline-flex min-w-max items-center gap-5 border-b border-border">
        {TABS.map((t) => {
          const count = t.key === "received" ? receivedCount : null;
          return (
            <Link
              key={t.key}
              href={`/requests?tab=${t.key}`}
              className={cn(
                "pressable flex min-h-11 items-center border-b-2 px-0.5 text-[12px] font-semibold",
                active === t.key
                  ? "border-primary text-ink"
                  : "border-transparent text-muted hover:text-ink"
              )}
            >
              {t.label}
              {count !== null && count > 0 && (
                <span className="ml-2 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">
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
