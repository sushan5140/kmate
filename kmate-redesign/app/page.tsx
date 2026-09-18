import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  FileCheck2,
  GraduationCap,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";

const WORKSPACE = [
  {
    icon: FileCheck2,
    title: "Application readiness",
    body: "See documents, forms, university extras and route-specific requirements in one checklist.",
    meta: "Your application state",
  },
  {
    icon: BookOpenCheck,
    title: "Official guidance",
    body: "Keep current GKS rules, source links and cycle labels beside the decisions they affect.",
    meta: "Evidence before advice",
  },
  {
    icon: GraduationCap,
    title: "University requirements",
    body: "Compare eligible universities without hiding when a university-specific source belongs to an older cycle.",
    meta: "Route-aware choices",
  },
  {
    icon: UsersRound,
    title: "Applicant network",
    body: "Find applicants by program, major, year and target university, then connect privately.",
    meta: "Relevant people only",
  },
];

const SOURCE_STATES = [
  {
    label: "Current official rule",
    tone: "bg-success-soft text-success",
    text: "Grounded in the current national guideline or a current official notice.",
  },
  {
    label: "Older university source",
    tone: "bg-gold-soft text-gold",
    text: "Useful context, but shown with its source cycle instead of pretending it is current.",
  },
  {
    label: "Community experience",
    tone: "bg-primary-soft text-primary",
    text: "Applicant experience stays helpful without becoming an official requirement.",
  },
];

const STEPS = [
  ["01", "Set your route", "Choose your GKS program, route, year, major and target universities."],
  ["02", "Build the file", "Turn the route into a real checklist with source-aware requirements."],
  ["03", "Prepare the interview", "Use the question database and your own private answer drafts."],
  ["04", "Find your cohort", "Connect with applicants whose application actually overlaps yours."],
];

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      <div className="absolute -inset-10 rounded-full bg-primary/10 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-[28px] border border-white/80 bg-surface/95 shadow-[0_35px_100px_-45px_rgba(23,33,29,.42)]">
        <div className="flex h-12 items-center justify-between border-b border-hairline px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-ink text-[10px] font-extrabold text-white">K</span>
            <span className="text-[11.5px] font-extrabold text-ink">Application workspace</span>
          </div>
          <span className="rounded-full bg-success-soft px-2.5 py-1 text-[9.5px] font-extrabold text-success">
            2027 · GKS-U
          </span>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-[1.15fr_.85fr] sm:p-5">
          <div className="rounded-[20px] bg-ink p-5 text-white">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-white/55">
                Application pulse
              </span>
              <CalendarDays className="h-4 w-4 text-white/55" />
            </div>
            <p className="mt-7 text-[28px] font-extrabold tracking-[-0.04em]">68%</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-white/60">
              Your core file is taking shape. Three items need attention next.
            </p>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[68%] rounded-full bg-[#87c9b4]" />
            </div>
          </div>

          <div className="rounded-[20px] border border-hairline bg-canvas/70 p-4">
            <span className="text-[9.5px] font-extrabold uppercase tracking-[0.13em] text-muted/70">
              Next up
            </span>
            <div className="mt-3 space-y-2.5">
              {[
                "Personal statement",
                "University document check",
                "Apostille review",
              ].map((item, index) => (
                <div key={item} className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 shadow-xs">
                  <span className={index === 0 ? "h-2 w-2 rounded-full bg-gks-u" : "h-2 w-2 rounded-full bg-primary/35"} />
                  <span className="text-[10.5px] font-semibold text-ink">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border border-hairline bg-surface p-4 sm:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-[9.5px] font-extrabold uppercase tracking-[0.13em] text-muted/70">
                  Source clarity
                </span>
                <p className="mt-1 text-[12px] font-bold text-ink">Know what is official before you act on it.</p>
              </div>
              <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                ["Current rule", "Official"],
                ["PNU detail", "Cycle tagged"],
                ["Interview tip", "Community"],
              ].map(([title, tag]) => (
                <div key={title} className="rounded-[14px] bg-canvas/75 px-3 py-2.5">
                  <p className="text-[10.5px] font-bold text-ink">{title}</p>
                  <p className="mt-0.5 text-[9.5px] font-semibold text-muted">{tag}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-4 -left-3 hidden items-center gap-2 rounded-[14px] border border-white/80 bg-white/92 px-3 py-2.5 shadow-card backdrop-blur-xl sm:flex">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <div>
          <p className="text-[10px] font-extrabold text-ink">Requirement matched</p>
          <p className="text-[9px] text-muted">Embassy Track · R-GKS</p>
        </div>
      </div>
    </div>
  );
}

export default async function LandingPage() {
  const user = await getAuthenticatedUser();
  if (user) redirect("/home");

  return (
    <main className="overflow-x-clip">
      <section className="relative">
        <div className="grid-texture pointer-events-none absolute inset-x-0 top-0 h-[760px]" aria-hidden />
        <div className="relative mx-auto grid max-w-[1180px] gap-14 px-4 pb-24 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:gap-16 lg:pb-28 lg:pt-28">
          <div className="max-w-[640px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface/80 px-3 py-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted shadow-xs backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              GKS application intelligence
            </div>

            <h1 className="text-balance mt-6 text-[43px] font-extrabold leading-[0.99] tracking-[-0.052em] text-ink sm:text-[60px] lg:text-[68px]">
              One place to build the application.
              <span className="mt-2 block font-serif text-[1.03em] font-normal italic tracking-[-0.025em] text-primary">
                One trail of sources to trust.
              </span>
            </h1>

            <p className="mt-6 max-w-[585px] text-[15px] font-medium leading-7 text-muted sm:text-[16px]">
              KMate turns GKS rules, documents, university requirements, deadlines, interview prep,
              and applicant discovery into one focused workspace without mixing old-cycle advice into current guidance.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="pressable inline-flex h-12 items-center gap-2 rounded-[15px] bg-ink px-5 text-[13px] font-bold text-white shadow-card"
              >
                Open your workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/about"
                className="pressable inline-flex h-12 items-center rounded-[15px] border border-hairline-strong bg-surface/80 px-5 text-[13px] font-bold text-ink shadow-xs hover:bg-white"
              >
                How KMate works
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-muted">
              {["Current-cycle labels", "Private applicant connections", "Official sources linked"].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <ProductPreview />
        </div>
      </section>

      <section id="workspace" className="border-y border-hairline bg-surface/52">
        <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[.82fr_1.18fr] lg:gap-14">
            <div className="max-w-[480px]">
              <p className="kmate-kicker text-primary">The workspace</p>
              <h2 className="text-balance mt-3 text-[31px] font-extrabold leading-[1.05] tracking-[-0.038em] text-ink sm:text-[40px]">
                Built around the decisions that actually move a GKS application forward.
              </h2>
              <p className="mt-4 text-[14px] font-medium leading-7 text-muted">
                The application stays primary. Community, AI, interview practice, and reference tools sit around it instead of becoming the product hierarchy.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {WORKSPACE.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-[22px] border border-hairline bg-canvas/62 p-5 sm:p-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-surface text-primary shadow-xs ring-1 ring-hairline">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.13em] text-muted/65">{item.meta}</p>
                    <h3 className="mt-1.5 text-[16px] font-extrabold tracking-[-0.018em] text-ink">{item.title}</h3>
                    <p className="mt-2 text-[12.5px] font-medium leading-6 text-muted">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[.95fr_1.05fr] lg:items-center lg:gap-16">
          <div className="order-2 rounded-[28px] border border-hairline bg-surface p-5 shadow-card sm:p-7 lg:order-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <p className="text-[12px] font-extrabold text-ink">Source status travels with the information</p>
            </div>
            <div className="mt-5 space-y-3">
              {SOURCE_STATES.map((state) => (
                <div key={state.label} className="rounded-[18px] border border-hairline bg-canvas/55 p-4">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[9.5px] font-extrabold ${state.tone}`}>
                    {state.label}
                  </span>
                  <p className="mt-2.5 text-[12px] font-medium leading-5 text-muted">{state.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <p className="kmate-kicker text-primary">Source clarity</p>
            <h2 className="text-balance mt-3 text-[31px] font-extrabold leading-[1.05] tracking-[-0.038em] text-ink sm:text-[40px]">
              A rule, an old university page, and an applicant story are not the same kind of evidence.
            </h2>
            <p className="mt-5 max-w-[560px] text-[14px] font-medium leading-7 text-muted">
              KMate keeps those layers visible. That means useful context can stay useful without quietly turning into a current official requirement.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-hairline bg-ink text-white">
        <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6 lg:py-24">
          <div className="max-w-[620px]">
            <p className="kmate-kicker text-[#9fcbbb]">One workflow</p>
            <h2 className="text-balance mt-3 text-[31px] font-extrabold leading-[1.05] tracking-[-0.038em] sm:text-[40px]">
              From choosing a route to walking into the interview prepared.
            </h2>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([step, title, body]) => (
              <div key={step} className="border-t border-white/15 pt-5">
                <p className="font-serif text-[34px] italic text-[#9fcbbb]">{step}</p>
                <h3 className="mt-3 text-[14px] font-extrabold">{title}</h3>
                <p className="mt-2 text-[12px] font-medium leading-6 text-white/58">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6 lg:py-24">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[26px] border border-hairline bg-surface p-6 md:col-span-2 sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-primary-soft text-primary">
              <Search className="h-5 w-5" />
            </div>
            <h2 className="mt-8 max-w-[580px] text-[27px] font-extrabold leading-[1.08] tracking-[-0.032em] text-ink sm:text-[34px]">
              Find applicants by the application they are actually building.
            </h2>
            <p className="mt-4 max-w-[620px] text-[13px] font-medium leading-6 text-muted">
              Program, route, major, application year and target universities create useful overlap. No public phone-number wall required.
            </p>
          </div>

          <div className="rounded-[26px] bg-primary p-6 text-white sm:p-8">
            <MessageCircle className="h-5 w-5 text-white/70" />
            <h3 className="mt-8 text-[22px] font-extrabold leading-tight tracking-[-0.025em]">Connect first. Message second.</h3>
            <p className="mt-3 text-[12.5px] font-medium leading-6 text-white/70">
              Private in-app messaging opens after a connection is accepted, with block and report controls built in.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="mx-auto max-w-[1180px] overflow-hidden rounded-[30px] bg-[#dce9e2] px-5 py-10 sm:px-10 sm:py-12 lg:flex lg:items-center lg:justify-between lg:gap-12">
          <div className="max-w-[650px]">
            <p className="kmate-kicker text-primary">Start from your route</p>
            <h2 className="mt-3 text-[30px] font-extrabold leading-[1.06] tracking-[-0.04em] text-ink sm:text-[40px]">
              Make the application easier to see before you make it harder to finish.
            </h2>
            <p className="mt-4 text-[13px] font-medium leading-6 text-muted">
              Sign in, set your GKS route, and let KMate organize the next decisions around it.
            </p>
          </div>
          <Link
            href="/login"
            className="pressable mt-7 inline-flex h-12 shrink-0 items-center gap-2 rounded-[15px] bg-ink px-5 text-[13px] font-bold text-white shadow-card lg:mt-0"
          >
            Sign in with Google
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
