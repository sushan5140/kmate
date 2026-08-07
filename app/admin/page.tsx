import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata: Metadata = {
  title: "Admin — KMate",
};

export default async function AdminOverviewPage() {
  await requireAdmin();

  const admin = getSupabaseAdmin();
  const [{ count: questionsCount }, { count: ecaCount }, { count: mistakesCount }, { count: reportsCount }] = await Promise.all([
    admin.from("interview_questions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("eca_entries").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("mistake_entries").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  const sections = [
    { href: "/admin/questions", label: "Questions", description: "Interview question moderation queue.", pending: questionsCount ?? 0 },
    { href: "/admin/eca", label: "Extracurriculars", description: "ECA submission moderation queue.", pending: ecaCount ?? 0 },
    { href: "/admin/mistakes", label: "Mistakes", description: "Mistake-entry moderation queue.", pending: mistakesCount ?? 0 },
    { href: "/admin/reports", label: "Reports", description: "Open user reports awaiting review.", pending: reportsCount ?? 0 },
  ];

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Admin</h1>
      <p className="mt-1 text-[13.5px] text-muted">Single entry point for moderation queues and user management.</p>
      <div className="mt-4">
        <AdminNav active="/admin" />
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {sections.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card interactive className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-medium text-ink">{s.label}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">{s.description}</p>
              </div>
              {s.pending > 0 && (
                <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-gks-u px-1.5 text-[12px] font-semibold text-white">
                  {s.pending > 99 ? "99+" : s.pending}
                </span>
              )}
            </Card>
          </Link>
        ))}

        <Link href="/admin/users">
          <Card interactive>
            <p className="text-[14px] font-medium text-ink">Users</p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Change a user&apos;s track (GKS-U ⇄ GKS-G), or grant selected applicants access to both tracks&apos;
              content.
            </p>
          </Card>
        </Link>
      </div>
    </main>
  );
}
