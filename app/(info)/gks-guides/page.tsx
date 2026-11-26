import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES, guidePath, SITE_URL } from "@/lib/marketing/gks-guides";
export const metadata: Metadata = {
  title: "Global Korea Scholarship preparation guides | KMate",
  description: "Practical GKS undergraduate and graduate preparation guides, document checklists and university requirement verification.",
  alternates: { canonical: SITE_URL + "/gks-guides" },
  openGraph: { title: "GKS preparation guides | KMate", description: "Practical, source-aware Global Korea Scholarship preparation guides.", url: SITE_URL + "/gks-guides" },
};
export default function GuidesPage() {
  return <article className="space-y-6 text-[14px] leading-relaxed text-ink">
    <header><p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Global Korea Scholarship</p><h1 className="mt-2 text-[30px] font-semibold tracking-tight">GKS preparation guides</h1><p className="mt-3 text-muted">Practical starting points for undergraduate and graduate applicants. No account is required to read these guides. KMate is independently built and is not an official scholarship service.</p></header>
    <div className="grid gap-3 sm:grid-cols-2">{GUIDES.map(g => <Link key={g.slug} href={guidePath(g.slug)} className="rounded-2xl border border-hairline bg-white p-4 hover:shadow-card"><h2 className="text-[16px] font-semibold">{g.heading}</h2><p className="mt-2 text-[13px] text-muted">{g.description}</p><span className="mt-3 inline-block font-medium text-primary">Read guide →</span></Link>)}</div>
    <p className="text-[13px] text-muted">Verify current-cycle instructions with the official national notice and your first-round institution before submitting an application.</p>
  </article>;
}
