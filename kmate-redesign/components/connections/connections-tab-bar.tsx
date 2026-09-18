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
  /**
   * Only "Requests received" ever badges -- a badge signals something needs
   * your action, and received is the only tab where that's true ("sent" is
   * waiting on the other person; "connected" and "discover" aren't tasks at
   * all).
   */
  receivedCount: number;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="inline-flex min-w-max items-center gap-1 rounded-[15px] border border-hairline bg-surface/80 p-1 shadow-xs">
      {TABS.map((t) => {
        const count = t.key === "received" ? receivedCount : null;
        return (
          <Link
            key={t.key}
            // Always explicit, even for whichever tab happens to be the
            // default -- the default itself is conditional (whichever tab
            // renders when `tab` is omitted depends on whether there are
            // pending incoming requests), so omitting the param here could
            // silently resolve to the wrong tab.
            href={`/requests?tab=${t.key}`}
            className={cn(
              "pressable rounded-[11px] px-3 py-2 text-[11px] font-extrabold",
              active === t.key ? "bg-ink text-white shadow-xs" : "text-muted hover:bg-canvas hover:text-ink"
            )}
          >
            {t.label}
            {count !== null && count > 0 && (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                  active === t.key ? "bg-white/14" : "bg-primary-soft text-primary"
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
