import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, guidePath, guestToolHref, SITE_URL } from "@/lib/marketing/gks-guides";
type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return GUIDES.map(g => ({ slug: g.slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const g = GUIDES.find(item => item.slug === slug);
  if (!g) return { robots: { index: false, follow: false } };
  const url = SITE_URL + guidePath(g.slug);
  return { title: g.title, description: g.description, alternates: { canonical: url },
    openGraph: { title: g.title, description: g.description, url },
    twitter: { card: "summary", title: g.title, description: g.description } };
}
export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const g = GUIDES.find(item => item.slug === slug);
  if (!g) notFound();
  return <article className="space-y-6 text-[14px] leading-relaxed text-ink">
    <Link href="/gks-guides" className="text-[13px] text-primary underline">All GKS preparation guides</Link>
    <header><p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Independent applicant resource · reviewed 26 November 2026</p><h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-tight">{g.heading}</h1><p className="mt-3 text-muted">{g.intro}</p></header>
    {g.sections.map(s => <section key={s.title} className="space-y-2"><h2 className="text-[18px] font-semibold">{s.title}</h2><p className="text-muted">{s.body}</p></section>)}
    <section className="rounded-2xl border border-hairline bg-white p-4"><h2 className="text-[16px] font-semibold">Official sources to check</h2><ul className="mt-2 space-y-2">{g.sources.map(s => <li key={s.href}><a href={s.href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{s.label}</a></li>)}</ul><p className="mt-3 text-[12px] text-muted">KMate is independent of NIIED and the Korean government. Official notices and recipient instructions take precedence.</p></section>
    <section className="rounded-2xl bg-primary-soft p-4"><h2 className="text-[16px] font-semibold">Continue with KMate</h2><p className="mt-1 text-muted">Preview the relevant tool without an account. Guest access is read-only.</p><Link href={guestToolHref(g.tool.href)} className="mt-3 inline-block rounded-full bg-primary px-4 py-2 font-semibold text-white">{g.tool.label}</Link></section>
    <section><h2 className="text-[16px] font-semibold">Related guides</h2><ul className="mt-2 space-y-2">{GUIDES.filter(item => item.slug !== g.slug).map(item => <li key={item.slug}><Link href={guidePath(item.slug)} className="text-primary underline">{item.heading}</Link></li>)}</ul></section>
  </article>;
}
