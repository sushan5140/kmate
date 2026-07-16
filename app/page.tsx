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
import { ScholarMockup } from "@/components/marketing/scholar-mockup";
import { GksTimeline } from "@/components/marketing/gks-timeline";
import { Reveal } from "@/components/marketing/reveal";

const DEAD_ENDS = [
  {
    source: "Facebook · GKS Scholarship 2027 (42.3k members)",
    text: "“Anyone else applying GKS-U for mechanical engineering?? Please reply 🙏”",
    meta: "214 comments · buried in the feed within an hour",
  },
  {
    source: "Discord · #gks-general",
    text: "“is this server still active?”",
    meta: "Last real conversation: two application cycles ago",
  },
  {
    source: "Reddit · r/gks",
    text: "“Embassy track interview — what did they ask you?”",
    meta: "3 replies, all from a different track, a different year",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Set up your profile",
    body: "Track, major, application year, and your three university choices. That combination is the whole point.",
  },
  {
    step: "02",
    title: "See your overlap",
    body: "Discover shows the applicants who share your track, your major, your target universities — not 40,000 strangers.",
  },
  {
    step: "03",
    title: "Prep with evidence",
    body: "Study full profiles of scholars who got in — grades, extracurriculars, results — and drill the interview questions they were actually asked.",
  },
  {
    step: "04",
    title: "Swap contacts when ready",
    body: "Send a request. If they accept, contacts unlock for both of you. Until then, everything stays hidden.",
  },
];

const ELSEWHERE = [
  "A 42,000-member group where your question scrolls away in an hour",
  "Discord servers that went quiet two application cycles ago",
  "“I got in!!” posts with no GPA, no TOPIK level, no details",
  "Advice from someone on a different track, in a different year",
  "WhatsApp groups a stranger added you to at 3am",
];

const HERE = [
  "Only GKS applicants, filtered to your track, major, and universities",
  "Full scholar profiles — grades, ECs, awards, and the rejections too",
  "Interview questions tagged by category, from people who sat the interview",
  "Contact info hidden until both sides opt in",
  "Small on purpose. This is a cohort, not an audience",
];

const PRIVACY_PILLARS = [
  {
    icon: EyeOff,
    title: "Hidden by default",
    body: "Your Instagram, Telegram, WhatsApp — none of it appears on your profile. Ever. Other applicants see your track, major, and bio. That's it.",
  },
  {
    icon: UserRoundCheck,
    title: "Two-sided reveal",
    body: "Contacts unlock only after you send a request and the other person accepts. Either side can revoke, and everything goes dark again.",
  },
  {
    icon: Flag,
    title: "Block and report, built in",
    body: "One tap to block. Reports go to a real moderation queue, not a void. Blocked means gone — from search, from requests, from everything.",
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
                Find the{" "}
                <em className="font-serif font-normal italic tracking-normal text-primary">
                  right people
                </em>{" "}
                to prepare with.
              </h1>
              <p className="text-balance mt-5 max-w-lg text-[16px] leading-relaxed text-muted">
                You&apos;ve rewritten the SOP three times. Triple checked the
                transcripts. What you don&apos;t have is anyone applying to your same
                three universities — someone who gets what this particular
                application actually feels like at 1am.
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
              Everyone applying to GKS is looking for each other.{" "}
              <em className="font-serif font-normal italic text-muted">
                Nobody can find anyone.
              </em>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              The people who could actually help you exist — they&apos;re just
              scattered across megagroups, dead servers, and threads from three
              years ago. You know this because you&apos;ve looked.
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
            Four steps between you and the group chat that matters.
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
              Every profile carries a track, a major, an application year, and
              three university choices. Which means one search shows you the
              applicants who share yours — and when a university matches, you
              see whether it&apos;s their first choice or their backup.
            </p>
            <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
              Not a feed. Not an algorithm. A filtered list of the dozen people
              in the world working on your exact problem.
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
      {/* Scholar database                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-hairline bg-surface/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <Reveal className="max-w-2xl">
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-primary">
              Scholar database
            </p>
            <h2 className="text-balance mt-3 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[32px]">
              Research the applications that{" "}
              <em className="font-serif font-normal italic text-primary">actually worked.</em>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              Past scholars publish their full profile: GPA, TOPIK level,
              extracurriculars, awards — and both columns of the results.
              Where they got in, where they didn&apos;t, and which choice became
              their final placement. Filter by your track and major, and stop
              guessing what a winning application looks like.
            </p>
          </Reveal>
          <Reveal delay={0.15} className="mt-10">
            <div className="relative">
              <div className="glow-wash pointer-events-none absolute -inset-8" aria-hidden />
              <div className="relative">
                <ScholarMockup />
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
            Every question in the bank was reported by someone who sat the
            interview — sorted into the six categories panels actually draw
            from, upvoted when they keep coming up. The curveballs included.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Draft your answer under each question. It autosaves as you type,
            and it&apos;s visible to exactly one person: you.
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
              Contacts stay locked until both of you say yes.
            </h2>
            <p className="mt-4 text-[14.5px] leading-relaxed text-muted">
              Your Instagram, Telegram, and WhatsApp live behind a request.
              Send one, and the other person sees who you are — your track,
              major, and bio — before deciding. Accept, and contacts unlock
              for both sides at once.
            </p>
            <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
              No DMs from strangers. No scraping your handle out of a comment
              thread. You decide who can reach you, every single time.
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
              The application is yours alone.{" "}
              <em className="font-serif font-normal italic text-white/70">
                The waiting doesn&apos;t have to be.
              </em>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[14.5px] leading-relaxed text-white/60">
              Sign in, set your track and major, and see who else is already in
              it with you.
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
