import Link from "next/link";
import { cn } from "@/lib/cn";

export type OwnProfileTab = "profile" | "contacts";

export function OwnProfileTabBar({ active }: { active: OwnProfileTab }) {
  const tabs: { key: OwnProfileTab; label: string }[] = [
    { key: "profile", label: "Profile" },
    { key: "contacts", label: "Contact vault" },
  ];

  return (
    <div className="inline-flex items-center gap-5 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === "profile" ? "?" : `?tab=${t.key}`}
          className={cn(
            "pressable flex min-h-11 items-center border-b-2 px-0.5 text-[12px] font-semibold",
            active === t.key
              ? "border-primary text-ink"
              : "border-transparent text-muted hover:text-ink"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
