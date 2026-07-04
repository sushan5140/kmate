"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/home", label: "Home" },
  { href: "/discover", label: "Discover" },
  { href: "/interview-db", label: "Interview DB" },
  { href: "/requests", label: "Requests" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "border-b-2 border-transparent pb-0.5 transition-colors hover:text-ink",
              active ? "border-ink text-ink" : "text-muted"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
