import Link from "next/link";
import { redirect } from "next/navigation";
import {
  EyeOff,
  Flag,
  MessagesSquare,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { ConnectionGraph } from "@/components/marketing/connection-graph";
import { DiscoverMockup } from "@/components/marketing/discover-mockup";
import { InterviewMockup } from "@/components/marketing/interview-mockup";
import { ConnectMockup } from "@/components/marketing/connect-mockup";
import { GksTimeline } from "@/components/marketing/gks-timeline";
import { Reveal } from "@/components/marketing/reveal";

const DEAD_ENDS = [
  {
    source: "Official rules",
    text: "Which rule applies to my route, university and application stage?",
    meta: "National guidelines, embassy instructions and university requirements live in different places.",
  },
  {
    source: "Application tracking",
    text: "What have I completed, and what am I still missing?",
    meta: "Generic notes do not understand GKS routes, document stages or university-specific extras.",
  },
  {
    source: "Applicant communities",
    text: "Who is actually applying through the same route and targeting the same universities?",
    meta: "Large groups are useful, but they are not structured around your exact application.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Set your application route",
    body: "Choose GKS-U or GKS-G, your route, major, application year and route-appropriate universities.",
  },
  {
    step: "02",
    title: "Check the official rules",
    body: "Use cycle-tagged guidelines, requirement checks and source links instead of relying on remembered advice.",
  },
  {
    step: "03",
    title: "Build the application",
    body: "Track documents, forms, university extras, deadlines and interview preparation from one workspace.",
  },
  {
    step: "04",
    title: "Prepare with your cohort",
    body: "Find relevant applicants, connect intentionally and use private in-app messaging after both sides opt in.",
  },
];

const ELSEWHERE = [
  "National, embassy and university rules split across separate pages",
  "Old-cycle advice that still looks current",
  "Generic checklists that do not understand your application route",
  "Applicant groups with no structured university or major matching",
  "No clear distinction between official rules and community experience",
];

const HERE = [
  "Cycle-tagged GKS rules with official source links and conservative fallbacks",
  "Application Readiness tied to your route and target universities",
  "Requirement Checker that labels older university-specific detail instead of hiding its age",
  "Guideline-grounded GKS Assistant with community anecdotes kept out of official answers",
  "Applicant discovery and private in-app connections alongside the application tools",
];

const PRIVACY_PILLARS = [
  {
    icon: EyeOff,
    title: "Private by default",
    body: "Your public profile shows only the applicant information needed for useful matching. Private contact methods stay out of the public profile.",
  },
  {
    icon: UserRoundCheck,
    title: "Connection before conversation",
    body: "Applicants send and accept connection requests before using in-app messaging. You decide who can reach you.",
  },
  {
    icon: Flag,
    title: "Block and report built in",
    body: "Blocking, reporting and moderation are first-class product flows rather than an afterthought.",
  },
];

export default async function LandingPage() {
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/home");
  }

  return (
    <main className="overflow-x-clip">
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative">
        <div className="grid-texture pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-5xl gap-14 px-6 pb-24 pt-20 sm:pt-28 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10">
          <div>
            <Reveal>
              <span className="inline-flex items-center rounded-full bg-ink/[0.04] px-3 py-1 text-[12px] font-medium uppercase tracking-wide text-muted ring-1 ring-hairline">
                For GKS-U &amp; GKS-G applicants
              </span>
              <h1 className="text-balance mt-5 text-[38px] font-semibold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[52px]">
                Build your{" "}
                <em className="font-serif font-normal italic tracking-normal text-primary">
                  GKS application
                </em>{" "}
                with the rules in reach.
              </h1>
              <p className="text-balance mt-5 max-w-lg text-[16px] leading-relaxed text-muted">
                Check official rules, track your documents, compare university requirements,
                prepare for interviews, and find applicants working through a similar route —
                without mixing old-cycle advice into current guidance.
              </p>

              <div className="mt-8 flex items-center gap-5">
                <Link
                  href="/login"
                  className="inline-flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-medium text-white shadow-xs transition-all duration-150 hover:shadow-card active:scale-[0.97]"
                >
                  Sign in with Google
                </Link>
                <Link
                  href="/about"
                  className="text-[14px] font-medium text-muted transition-colors hover:text-ink"
                >
                  Learn more →
                </Link>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.15} className="relative mx-auto w-full max-w-sm lg:mx-0 lg:max-w-none">
            <div className="glow-wash pointer-events-none absolute -inset-10" aria-hidden />
            <div className="relative">
              <ConnectionGraph />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Problem                                                           */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-hairline bg-surface/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <Reveal className="max-w-xl">
            <h2 className="text-balance text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[32px]">
              GKS information is everywhere.{" "}
              <em className="font-serif font-normal italic text-muted">
                Your application should not be.
              </em>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              KMate brings the application workflow together while keeping a hard line
              between current official rules, older source material, and community experience.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {DEAD_ENDS.map((item, i) => (
              <Reveal key={item.source} delay={i * 0.1}>
                <div className="h-full rounded-2xl bg-canvas p-4 ring-1 ring-hairline">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted/70">
                    {item.source}
                  </p>
                  <p className="mt-2.5 text-[13.5px] font-medium leading-relaxed text-ink/80">
                    {item.text}
                  </p>
                  <p className="mt-3 text-[11.5px] italic text-muted">{item.meta}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* How it works                                                      */}
      {/* ---------------------------------------------------------------- */}
      <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-20">
        <Reveal>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-primary">
            How it works
          </p>
          <h2 className="text-balance mt-3 max-w-lg text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[32px]">
            From route selection to a submission-ready workflow.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((item, i) => (
            <Reveal key={item.step} delay={i * 0.08}>
              <div className="relative">
                <span className="font-serif text-[40px] italic leading-none text-primary/30">
                  {item.step}
                </span>
                <h3 className="mt-3 text-[15px] font-semibold text-ink">{item.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Deep dive: Discover                                               */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-primary">
              Discover
            </p>
            <h2 className="text-balance mt-3 text-[24px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[28px]">
              Your cohort, filtered to the people who matter.
            </h2>
            <p className="mt-4 text-[14.5px] leading-relaxed text-muted">
              Profiles carry a GKS program, major, application year and route-appropriate
              university choices. Discover uses those fields to surface applicants with
              meaningful overlap instead of a generic social feed.
            </p>
            <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
              The community layer is there to support the application, not replace the
              official rules that decide it.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="relative">
              <div className="glow-wash pointer-events-none absolute -inset-8" aria-hidden />
              <div className="relative">
                <DiscoverMockup />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Interview DB                                                      */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <Reveal className="max-w-2xl">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-primary">
            Interview DB
          </p>
          <h2 className="text-balance mt-3 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[32px]">
            The highest-stakes fifteen minutes of the application,{" "}
            <em className="font-serif font-normal italic text-muted">rehearsed in advance.</em>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            Practice from a structured question bank grouped by interview theme,
            then keep your own answer drafts alongside the preparation workflow.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Your drafts stay private to your account while community-contributed
            material remains clearly separate from official guideline answers.
          </p>
        </Reveal>
        <Reveal delay={0.15} className="mt-10">
          <div className="relative">
            <div className="glow-wash pointer-events-none absolute -inset-8" aria-hidden />
            <div className="relative">
              <InterviewMockup />
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Deep dive: Connect                                                */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-primary">
              Connect
            </p>
            <h2 className="text-balance mt-3 text-[24px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[28px]">
              Connect first. Message inside KMate when both sides agree.
            </h2>
            <p className="mt-4 text-[14.5px] leading-relaxed text-muted">
              Send a connection request with your applicant profile visible for context.
              If the other person accepts, in-app messaging becomes available without
              exposing private contact methods on the public profile.
            </p>
            <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
              You can revoke, block or report when needed, and your external contact
              details remain in your private contact vault.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="relative">
              <div className="glow-wash pointer-events-none absolute -inset-8" aria-hidden />
              <div className="relative">
                <ConnectMockup />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Timeline                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-hairline bg-surface/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <Reveal>
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-primary">
              The GKS year
            </p>
            <h2 className="text-balance mt-3 max-w-xl text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[32px]">
              You need different people at different stages.{" "}
              <em className="font-serif font-normal italic text-muted">
                The application runs on a calendar.
              </em>
            </h2>
            <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-muted">
              The GKS-G cycle, roughly. GKS-U runs the same shape from
              September. Whichever track you&apos;re on, the person you need in
              February is not the person you need in June.
            </p>
          </Reveal>
          <Reveal delay={0.15} className="mt-12">
            <GksTimeline />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Comparison                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <Reveal>
          <h2 className="text-balance max-w-xl text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[32px]">
            You could keep refreshing the megagroup.
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-[24px] bg-canvas p-6 ring-1 ring-hairline sm:p-8">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted/70">
                Everywhere else
              </p>
              <ul className="mt-5 flex flex-col gap-4">
                {ELSEWHERE.map((item) => (
                  <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-muted">
                    <span className="mt-[9px] h-1 w-3 shrink-0 rounded-full bg-muted/40" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="relative h-full overflow-hidden rounded-[24px] bg-surface p-6 shadow-card ring-1 ring-primary/25 sm:p-8">
              <div className="glow-wash pointer-events-none absolute inset-0 opacity-70" aria-hidden />
              <div className="relative">
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-primary">
                  KMate
                </p>
                <ul className="mt-5 flex flex-col gap-4">
                  {HERE.map((item) => (
                    <li key={item} className="flex gap-3 text-[14px] font-medium leading-relaxed text-ink">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Privacy                                                           */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-6 pb-24 pt-4">
        <Reveal>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-primary">
            Private by design
          </p>
          <h2 className="text-balance mt-3 max-w-lg text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[32px]">
            Built for people who&apos;d rather not be found by everyone.
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PRIVACY_PILLARS.map((pillar, i) => {
            const Icon = pillar.icon;
            return (
              <Reveal key={pillar.title} delay={i * 0.1}>
                <div className="h-full rounded-[24px] bg-surface p-6 shadow-card ring-1 ring-hairline">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Icon className="h-4.5 w-4.5" strokeWidth={2} />
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold text-ink">{pillar.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">{pillar.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Closing CTA                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-ink">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 70% 80% at 50% 30%, black 40%, transparent 90%)",
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-2xl px-6 py-24 text-center">
          <Reveal>
            <MessagesSquare className="mx-auto h-6 w-6 text-white/40" />
            <h2 className="text-balance mt-5 text-[28px] font-semibold leading-tight tracking-[-0.015em] text-white sm:text-[36px]">
              One place for the application.{" "}
              <em className="font-serif font-normal italic text-white/70">
                Clear sources for every important rule.
              </em>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[14.5px] leading-relaxed text-white/60">
              Sign in, set your GKS route, and turn the official requirements into an application you can actually manage.
            </p>
            <div className="mt-8">
              <Link
                href="/login"
                className="inline-flex h-11 items-center rounded-full bg-white px-6 text-[14px] font-medium text-ink shadow-pop transition-all duration-150 hover:shadow-lg active:scale-[0.97]"
              >
                Sign in with Google
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
