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
  counts,
}: {
  active: ConnectionsTab;
  counts: { received: number; connected: number; sent: number };
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline pb-3">
      {TABS.map((t) => {
        const count = t.key === "discover" ? null : counts[t.key];
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
              "rounded-full px-3 py-1.5 text-[13px] font-medium",
              active === t.key ? "bg-primary text-white" : "text-muted hover:bg-canvas hover:text-ink"
            )}
          >
            {t.label}
            {count !== null && count > 0 && (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                  active === t.key ? "bg-white/20" : "bg-ink/[0.08] text-ink"
                )}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
