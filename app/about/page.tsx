import Link from "next/link";
import { ArrowRight, BookOpenCheck, ClipboardCheck, ShieldCheck, Users } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";

const pillars = [
  {
    icon: BookOpenCheck,
    title: "Official rules stay official",
    body: "Guideline-grounded answers use official GKS evidence. Community experience is kept separate so an anecdote cannot silently become a rule.",
  },
  {
    icon: ClipboardCheck,
    title: "Application work is route-aware",
    body: "Readiness, university selection and requirement checks follow the applicant's program and route rather than assuming every GKS application works the same way.",
  },
  {
    icon: ShieldCheck,
    title: "Uncertainty is visible",
    body: "Older university-specific detail is cycle-labelled, missing evidence stays 'Not stated', and current national rules are not blended with unverified carry-over.",
  },
  {
    icon: Users,
    title: "Community supports the workflow",
    body: "Applicant discovery and private in-app messaging help people prepare together without making community posts the authority for official requirements.",
  },
];

export default async function AboutPage() {
  const user = await getAuthenticatedUser();

  return (
    <main className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">About KMate</p>
      <h1 className="mt-3 max-w-3xl text-[34px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[46px]">
        A GKS application workspace built around source clarity.
      </h1>
      <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted">
        KMate brings official guideline support, application readiness, university requirement checks,
        interview preparation and applicant connections into one product. It is not an official NIIED
        service, and it is designed to make that boundary visible rather than blur it.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {pillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <section key={pillar.title} className="rounded-2xl border border-hairline bg-white p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <h2 className="mt-4 text-[15px] font-semibold text-ink">{pillar.title}</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{pillar.body}</p>
            </section>
          );
        })}
      </div>

      <section className="mt-10 rounded-2xl bg-canvas p-5">
        <h2 className="text-[16px] font-semibold text-ink">The source rule</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          When KMate does not have sufficiently direct official evidence, it should say so. Applicants
          should still verify final requirements against the current Study in Korea / NIIED guideline
          and the relevant embassy or university instructions before submitting.
        </p>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={user ? "/home" : "/login"}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-white"
        >
          {user ? "Open KMate" : "Sign in with Google"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/official-guidelines"
          className="inline-flex h-10 items-center rounded-full bg-white px-4 text-[13px] font-medium text-ink ring-1 ring-hairline-strong"
        >
          Official Guidelines
        </Link>
      </div>
    </main>
  );
}
