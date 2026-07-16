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
    <div className="flex items-center gap-1.5 border-b border-hairline pb-3">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === "profile" ? "?" : `?tab=${t.key}`}
          className={cn(
            "rounded-full px-3 py-1.5 text-[13px] font-medium",
            active === t.key ? "bg-primary text-white" : "text-muted hover:bg-canvas hover:text-ink"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
