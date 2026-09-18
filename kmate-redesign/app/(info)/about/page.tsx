import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenCheck, ClipboardCheck, ShieldCheck, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "About — KMate",
  description:
    "How KMate separates official GKS guidance, application workflow tools, and applicant community features.",
};

const PILLARS = [
  {
    icon: BookOpenCheck,
    title: "Official rules stay official",
    body: "Guideline-grounded answers use official GKS evidence. Community experience is kept separate so an anecdote cannot silently become a rule.",
  },
  {
    icon: ClipboardCheck,
    title: "Application work is route-aware",
    body: "Readiness, university selection and requirement checks follow the applicant's program and route instead of assuming every GKS application works the same way.",
  },
  {
    icon: ShieldCheck,
    title: "Uncertainty stays visible",
    body: "Older university-specific details are cycle-labelled, missing evidence stays Not stated, and current national rules are not blended with unverified carry-over.",
  },
  {
    icon: Users,
    title: "Community supports the workflow",
    body: "Applicant discovery and private in-app messaging help people prepare together without making community posts the authority for official requirements.",
  },
];

export default function AboutPage() {
  return (
    <article className="text-[14px] leading-relaxed text-ink">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
        About KMate
      </p>
      <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.015em] sm:text-[34px]">
        A GKS application workspace built around source clarity.
      </h1>
      <p className="mt-4 text-muted">
        KMate brings official guideline support, application readiness, university requirement
        checks, interview preparation and applicant connections into one product. It is not an
        official NIIED service, and it is designed to make that boundary visible rather than blur it.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <section key={pillar.title} className="rounded-2xl border border-hairline bg-white p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <h2 className="mt-3 text-[14px] font-semibold text-ink">{pillar.title}</h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{pillar.body}</p>
            </section>
          );
        })}
      </div>

      <section className="mt-7 rounded-2xl bg-canvas p-4">
        <h2 className="text-[14px] font-semibold text-ink">The source rule</h2>
        <p className="mt-1.5 text-[12.75px] leading-relaxed text-muted">
          When KMate does not have sufficiently direct official evidence, it should say so.
          Applicants should still verify final requirements against the current Study in Korea /
          NIIED guideline and the relevant embassy or university instructions before submitting.
        </p>
      </section>

      <p className="mt-6 font-medium">
        KMate is independently built and is not affiliated with, endorsed by, or operated by NIIED
        or the Korean government.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/login"
          className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[12.5px] font-medium text-white"
        >
          Sign in with Google
        </Link>
        <Link
          href="/official-guidelines"
          className="inline-flex h-9 items-center rounded-full bg-white px-4 text-[12.5px] font-medium text-ink ring-1 ring-hairline-strong"
        >
          Official Guidelines
        </Link>
        <Link
          href="/guidelines"
          className="inline-flex h-9 items-center rounded-full bg-white px-4 text-[12.5px] font-medium text-ink ring-1 ring-hairline-strong"
        >
          Community guidelines
        </Link>
      </div>
    </article>
  );
}
