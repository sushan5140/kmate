import Link from "next/link";

const ADMIN_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/questions", label: "Questions" },
  { href: "/admin/eca", label: "Extracurriculars" },
  { href: "/admin/mistakes", label: "Mistakes" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/notices", label: "Notices" },
  { href: "/admin/deadlines", label: "Deadlines" },
  { href: "/admin/youtube", label: "YouTube" },
  { href: "/admin/users", label: "Users" },
];

export function AdminNav({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ADMIN_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${
            link.href === active ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-muted"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
