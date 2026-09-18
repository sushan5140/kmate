import Link from "next/link";
import { cn } from "@/lib/cn";

export type OwnProfileTab = "profile" | "contacts";

export function OwnProfileTabBar({ active }: { active: OwnProfileTab }) {
  const tabs: { key: OwnProfileTab; label: string }[] = [
    { key: "profile", label: "Profile" },
    { key: "contacts", label: "Contact vault" },
  ];

  return (
    <div className="inline-flex items-center gap-1 rounded-[12px] border border-border bg-white p-1 shadow-xs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === "profile" ? "?" : `?tab=${t.key}`}
          className={cn(
            "pressable rounded-[9px] px-3 py-2 text-[10.5px] font-extrabold",
            active === t.key
              ? "bg-primary text-white shadow-xs"
              : "text-muted hover:bg-primary-soft hover:text-primary"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
