import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/auth-server";

const FEATURES = [
  {
    index: "01",
    title: "Find your people",
    body: "Filter by track, major, university, and year. Not a forum full of strangers, the small group of people applying to your exact combination.",
  },
  {
    index: "02",
    title: "Prep for interviews",
    body: "A question bank built by people who've sat in the interview chair before you. Draft your own answers in private, they save as you type, and nobody else sees them but you.",
  },
  {
    index: "03",
    title: "Build a stronger profile",
    body: "Browse a ranked list of extracurriculars other applicants say actually mattered, from TOPIK certificates to research papers to volunteer work, so you're not guessing what to add to your application.",
  },
  {
    index: "04",
    title: "See who else is applying",
    body: "Browse other applicants' profiles by major and university. Same target school, different country, similar stress levels.",
  },
  {
    index: "05",
    title: "Connect safely",
    body: "Nothing gets shared automatically. Your contact info stays hidden until you send a request and the other person accepts. You decide who can reach you.",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/home");
  }

  return (
    <main>
      <section className="relative overflow-hidden">
        <div className="grid-texture pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-2xl px-6 pb-20 pt-20 text-center sm:pt-28">
          <span className="inline-flex items-center rounded-full bg-ink/[0.04] px-3 py-1 text-[12px] font-medium uppercase tracking-wide text-muted ring-1 ring-hairline">
            For GKS-U &amp; GKS-G applicants
          </span>
          <h1 className="text-balance mt-5 text-[34px] font-semibold leading-[1.15] tracking-[-0.01em] text-ink sm:text-[44px]">
            Find the right people to prepare with.
          </h1>
          <p className="text-balance mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-muted">
            You&apos;ve rewritten the SOP three times. Triple checked the transcripts. What
            you don&apos;t have is anyone applying to your same three universities, someone
            who gets what this particular application actually feels like at 1am.
          </p>
          <p className="text-balance mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-muted">
            GKS Connect helps GKS-U and GKS-G applicants find each other by major,
            university, and track, swap interview notes, and exchange contact info
            safely. Nothing is public by default.
          </p>

          <div className="mt-8 flex items-center justify-center gap-5">
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
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-6 pb-24">
        <div className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {FEATURES.map((feature) => (
            <div key={feature.index} className="flex gap-6 py-7">
              <span className="tabular-nums shrink-0 text-[13px] font-medium text-muted/70">
                {feature.index}
              </span>
              <div>
                <h3 className="text-[15px] font-semibold text-ink">{feature.title}</h3>
                <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted">
                  {feature.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
