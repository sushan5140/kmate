import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { buildCheckerOptions } from "@/lib/requirements/options";
import { getApplicationWorkspace } from "@/lib/readiness";
import { getProfileDefaults } from "@/lib/readiness/profile";
import { universitySlotsFor } from "@/lib/readiness/application";
import { ReadinessWorkspace } from "@/components/readiness/readiness-workspace";
import { GksU2027RouteDashboard } from "@/components/official-guidelines/gks-u-2027-route-dashboard";
import { GksU2027SmartTools } from "@/components/official-guidelines/gks-u-2027-smart-tools";
import { GksU2027FormAssistant } from "@/components/official-guidelines/gks-u-2027-form-assistant";
import { GksU2027ManualChecklist } from "@/components/official-guidelines/gks-u-2027-manual-checklist";

export const metadata: Metadata = {
  title: "Application Readiness — KMate",
};

interface SearchParams {
  program?: string;
  track?: string;
  subtype?: string;
  /** Repeated, one per slot; `maj` pairs with `uni` positionally. */
  uni?: string | string[];
  maj?: string | string[];
  /** "1" once the applicant has touched the configuration, so profile defaults stop applying. */
  own?: string;
}

const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

export default async function ApplicationReadinessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireOnboarded("/application-readiness");
  const params = await searchParams;

  // The option tree is the Requirement Checker's own, so tracks, program types
  // and university lists have one source and cannot drift between the pages.
  const options = buildCheckerOptions();
  const defaults = await getProfileDefaults(user.id);

  // A bare URL means "start from what KMate already knows about you". Once the
  // applicant edits anything the URL carries `own=1` and profile defaults stop
  // being applied, so clearing a field cannot spring back on the next render.
  const usingDefaults = params.own !== "1" && !params.program;

  const program = options.programs.some((p) => p.value === params.program)
    ? params.program!
    : usingDefaults && options.programs.some((p) => p.value === defaults.program)
      ? defaults.program
      : "";

  const trackCandidate = usingDefaults && !params.track ? defaults.track : params.track;
  const track =
    program && (options.tracks[program] ?? []).some((t) => t.value === trackCandidate)
      ? trackCandidate!
      : "";

  const trackOption = program ? (options.tracks[program] ?? []).find((t) => t.value === track) : undefined;
  const subtypeCandidate = usingDefaults && !params.subtype ? defaults.subtype : params.subtype;
  const subtype = (trackOption?.subtypes ?? []).some((s) => s.value === subtypeCandidate)
    ? subtypeCandidate!
    : "";

  const pool = subtype
    ? options.universities[`${program}|${track}|${subtype}`] ?? []
    : options.universities[`${program}|${track}`] ?? [];

  const rawNames = usingDefaults && !params.uni ? defaults.universities : asArray(params.uni);
  const rawMajors = usingDefaults && !params.uni ? [] : asArray(params.maj);

  const slots = universitySlotsFor(program, track, subtype);
  const universities: { name: string; major: string }[] = [];
  for (let i = 0; i < rawNames.length && universities.length < slots; i++) {
    const name = rawNames[i];
    // Validated against the route's own list, and de-duplicated: a
    // hand-edited URL cannot name a university this route does not offer, nor
    // the same university twice.
    if (!track || !pool.includes(name)) continue;
    if (universities.some((u) => u.name === name)) continue;
    const major = (rawMajors[i] ?? (usingDefaults ? defaults.major : "")).slice(0, 120);
    universities.push({ name, major });
  }

  const workspace = program
    ? getApplicationWorkspace({
        program: program as "GKS-U" | "GKS-G",
        ...(track ? { track } : {}),
        ...(subtype ? { subtype } : {}),
        universities,
      })
    : null;

  // Majors this university's own verified rules name, so the applicant is
  // offered the exact strings the rules match on rather than guessing.
  const majorSuggestions: Record<string, string[]> = {};
  for (const u of universities) {
    const meta = options.meta[`${program}|${track}|${u.name}`];
    if (meta?.majorSuggestions.length) majorSuggestions[u.name] = meta.majorSuggestions;
  }

  const showGksU2027 = program === "GKS-U";
  const routePath =
    track === "embassy" ? (subtype === "r_gks" ? "r_gks" : "general") : null;
  const savedUniversityNames = universities.map((u) => u.name);
  const toolMajor =
    universities.find((u) => u.major.trim().length > 0)?.major ?? defaults.major;

  return (
    <main className="workspace-page mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="My application"
        title="Application Readiness"
        description="Build the file route by route: setup, verified document progress, university-specific extras, forms, and final checks."
        meta={
          <div className="inline-flex items-start gap-2 border-l-2 border-primary bg-transparent py-1 pl-3">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p className="max-w-2xl text-[10.5px] font-medium leading-5 text-muted">
              Checklist progress is not an eligibility decision. When an official source does not state something,
              KMate keeps it as <span className="font-bold text-ink">Not stated</span> instead of guessing.
            </p>
          </div>
        }
      />

      <nav
        className="sticky top-[58px] z-20 mt-5 flex max-w-full gap-5 overflow-x-auto border-b border-border bg-canvas/95 backdrop-blur-xl md:top-0"
        aria-label="Readiness page sections"
      >
        <a href="#application-setup" className="min-h-11 shrink-0 border-b-2 border-transparent px-0.5 py-3 text-[12px] font-semibold text-muted transition-colors hover:border-primary/30 hover:text-ink">
          01 · Route &amp; setup
        </a>
        <a href="#application-checklist" className="min-h-11 shrink-0 border-b-2 border-transparent px-0.5 py-3 text-[12px] font-semibold text-muted transition-colors hover:border-primary/30 hover:text-ink">
          02 · Checklist
        </a>
        {showGksU2027 && (
          <a href="#supporting-tools" className="min-h-11 shrink-0 border-b-2 border-transparent px-0.5 py-3 text-[12px] font-semibold text-muted transition-colors hover:border-primary/30 hover:text-ink">
            03 · Forms &amp; final checks
          </a>
        )}
      </nav>

      <div id="application-setup">
      {showGksU2027 && (
        <GksU2027RouteDashboard
          defaultPath={routePath}
          savedUniversities={savedUniversityNames}
          unresolvedUniversities={usingDefaults ? defaults.unresolvedUniversities : []}
          defaultMajor={toolMajor}
        />
      )}
      </div>

      <div id="application-checklist" className="mt-6 scroll-mt-6">
        <ReadinessWorkspace
          key={`${program}|${track}|${subtype}|${universities.map((u) => u.name).join(",")}`}
          options={options}
          defaults={defaults}
          usingDefaults={usingDefaults}
          config={{ program, track, subtype, universities }}
          slots={slots}
          pool={pool}
          majorSuggestions={majorSuggestions}
          workspace={workspace}
        />
      </div>

      {showGksU2027 && (
        <section id="supporting-tools" className="mt-8 scroll-mt-20 border-t-2 border-ink pt-6">
          <div>
            <p className="text-[12px] font-semibold text-primary">
              2027 supporting tools
            </p>
            <h2 className="mt-1 text-[18px] font-semibold text-ink">
              Open the part you are working on
            </h2>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
              Your core readiness checklist stays visible above. Detailed planning tools are collapsed so this page
              does not become one long dashboard.
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <details className="group rounded-[10px] border border-border bg-white">
              <summary className="cursor-pointer list-none px-4 py-3.5 text-[12px] font-extrabold text-ink">
                Documents and Embassy → University fallback
                <span className="float-right text-muted transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="border-t border-hairline px-4 pb-5">
                <GksU2027SmartTools
                  mode="readiness"
                  defaultPath={routePath}
                  savedUniversities={savedUniversityNames}
                  defaultMajor={toolMajor}
                />
              </div>
            </details>

            <details className="group rounded-[10px] border border-border bg-white">
              <summary className="cursor-pointer list-none px-4 py-3.5 text-[13px] font-semibold text-ink">
                Forms 1–7 assistant
                <span className="float-right text-muted transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="border-t border-hairline px-4 pb-5">
                <GksU2027FormAssistant defaultRoute={routePath} />
              </div>
            </details>

            <details className="group rounded-[10px] border border-border bg-white">
              <summary className="cursor-pointer list-none px-4 py-3.5 text-[13px] font-semibold text-ink">
                Final manual self-check
                <span className="float-right text-muted transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="border-t border-hairline px-4 pb-5">
                <GksU2027ManualChecklist />
              </div>
            </details>
          </div>
        </section>
      )}
    </main>
  );
}
