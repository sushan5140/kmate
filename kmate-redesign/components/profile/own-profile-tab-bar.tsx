import Link from "next/link";
import { cn } from "@/lib/cn";

export type OwnProfileTab = "profile" | "contacts";

/**
 * Contact vault is deliberately a separate tab, not merged into the same
 * form as the public-profile fields -- it's a visually distinct category of
 * data (private until a connection is accepted, vs. bio/major/universities
 * which are public), so it shouldn't read as "just another field" on the
 * same save action.
 */
export function OwnProfileTabBar({ active }: { active: OwnProfileTab }) {
  const tabs: { key: OwnProfileTab; label: string }[] = [
    { key: "profile", label: "Profile" },
    { key: "contacts", label: "Contact vault" },
  ];

  return (
    <div className="inline-flex items-center gap-1 rounded-[15px] border border-hairline bg-surface/80 p-1 shadow-xs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === "profile" ? "?" : `?tab=${t.key}`}
          className={cn(
            "pressable rounded-[11px] px-3 py-2 text-[11px] font-extrabold",
            active === t.key ? "bg-ink text-white shadow-xs" : "text-muted hover:bg-canvas hover:text-ink"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
