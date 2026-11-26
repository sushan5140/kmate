import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { getReviewerGuest, requireOnboarded } from "@/lib/supabase/auth-server";
import { CycleWorksheet } from "@/components/applications/cycle-worksheet";
import { ESSAY_GROUPS, PACKET_GROUPS } from "@/lib/applications/worksheets";
import { GraduatePreparationHub } from "@/components/readiness/graduate-preparation-hub";
import { buildCheckerOptions } from "@/lib/requirements/options";
import { getApplicationWorkspace } from "@/lib/readiness";
import { getProfileDefaults } from "@/lib/readiness/profile";
import { EditionNotice } from "@/components/official-guidelines/edition-notice";
import { profileIntake, editionMatches } from "@/lib/gks/guideline-editions";
import { resolvePlanningRoute } from "@/lib/gks/gks-u-2027-schedule";
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

  const target = profileIntake(program, defaults.program, defaults.applicationYear);
  const supported = (program === "GKS-U" || program === "GKS-G") && editionMatches(program, target);
  const workspace = supported
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

  const showGksU2027 = program === "GKS-U" && supported;
  const showGraduatePreparation = program === "GKS-G" && (target === "2027" || target === null);
  const graduateTrack = track === "embassy" || track === "university" ? track : "";
  const worksheetAccountId = (await getReviewerGuest()) ? null : user.id;
  const graduateAccountId = showGraduatePreparation ? worksheetAccountId : null;
  const routePath = resolvePlanningRoute(track, subtype);
  const savedUniversityNames = universities.map((u) => u.name);
  const toolMajor =
    universities.find((u) => u.major.trim().length > 0)?.major ?? defaults.major;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">Application Readiness</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        Your GKS application in one place: route, document progress, forms, fallback planning, and whatever each
        selected university additionally requires.
      </p>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-canvas px-3.5 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <p className="text-[12.5px] leading-relaxed text-muted">
          This tracks your checklist progress — it is not an eligibility decision and does not confirm your
          application is ready to submit. Where an official source does not state something, it says{" "}
          <span className="font-medium text-ink">Not stated</span> rather than guessing; a document KMate has
          no rule for is never presented as <span className="font-medium text-ink">not required</span>.
        </p>
      </div>

      {(program === "GKS-U" || program === "GKS-G") && <EditionNotice program={program} target={target} />}
      {program && !supported && <p className="mt-3 text-[13px] leading-relaxed text-muted">The configuration can still be saved, but the required-document checklist and selection timeline are withheld until the intake matches a reviewed edition. Open Official Guidelines for reference material.</p>}

      <nav className="mt-4 flex flex-wrap gap-2 text-[11.5px]" aria-label="Readiness page sections">
        <a href="#application-setup" className="rounded-full bg-white px-3 py-1.5 font-medium text-ink ring-1 ring-hairline-strong">
          1 · Route &amp; setup
        </a>
        <a href="#application-checklist" className="rounded-full bg-white px-3 py-1.5 font-medium text-ink ring-1 ring-hairline-strong">
          2 · Checklist
        </a>
        {showGraduatePreparation && (
          <a href="#graduate-preparation" className="rounded-full bg-white px-3 py-1.5 font-medium text-ink ring-1 ring-hairline-strong">
            GKS-G 2027 preparation
          </a>
        )}
        {showGksU2027 && (
          <a href="#supporting-tools" className="rounded-full bg-white px-3 py-1.5 font-medium text-ink ring-1 ring-hairline-strong">
            3 · Forms &amp; final checks
          </a>
        )}
      </nav>

      {showGraduatePreparation && (
          <a href="#graduate-preparation" className="rounded-full bg-white px-3 py-1.5 font-medium text-ink ring-1 ring-hairline-strong">
            GKS-G 2027 preparation
          </a>
        )}
        {showGksU2027 && (
          <a href="#supporting-tools" className="rounded-full bg-white px-3 py-1.5 font-medium text-ink ring-1 ring-hairline-strong">
            3 · Forms &amp; final checks
          </a>
        )}
      </nav>

      {showGraduatePreparation && (
        <GraduatePreparationHub key={graduateAccountId ?? "guest"} track={graduateTrack} accountId={graduateAccountId} />
      )}

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
          key={`${target ?? "unknown"}|${program}|${track}|${subtype}|${universities.map((u) => u.name).join(",")}`}
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
        <section id="supporting-tools" className="mt-10 scroll-mt-6 border-t border-hairline pt-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
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
            <details className="group rounded-2xl border border-hairline bg-white">
              <summary className="cursor-pointer list-none px-4 py-3.5 text-[13px] font-semibold text-ink">
                Documents and Embassy → University fallback
                <span className="float-right text-muted transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="border-t border-hairline px-4 pb-5">
                <GksU2027SmartTools
                  key={routePath ?? "unselected"}
                  mode="readiness"
                  defaultPath={routePath}
                  savedUniversities={savedUniversityNames}
                  defaultMajor={toolMajor}
                />
              </div>
            </details>

            <details className="group rounded-2xl border border-hairline bg-white">
              <summary className="cursor-pointer list-none px-4 py-3.5 text-[13px] font-semibold text-ink">
                Forms 1–7 assistant
                <span className="float-right text-muted transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="border-t border-hairline px-4 pb-5">
                <GksU2027FormAssistant key={routePath ?? "unselected"} defaultRoute={routePath} />
              </div>
            </details>

            <details className="group rounded-2xl border border-hairline bg-white">
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
      {program && track && (
        <section id="personal-preparation" className="mt-10 space-y-4 border-t border-hairline pt-6">
          <h2 className="text-[18px] font-semibold text-ink">Personal preparation tools</h2>
          <details className="rounded-2xl border border-hairline bg-white p-4">
            <summary className="cursor-pointer text-[14px] font-semibold text-ink">Personal statement &amp; study plan builder</summary>
            <div className="mt-3">
              <CycleWorksheet key={JSON.stringify([worksheetAccountId, program, track, subtype, universities])}
                accountId={worksheetAccountId} scope={JSON.stringify(["essays", program, track, subtype, universities])}
                groups={ESSAY_GROUPS} title="Build your own evidence-based drafts" wordCounts
                description="Outline real experiences, research or study interests and goals. This is a planning workspace, not an AI writer or an official form. Verify the actual format and length requirements for your cycle." />
            </div>
          </details>
          <details className="rounded-2xl border border-hairline bg-white p-4">
            <summary className="cursor-pointer text-[14px] font-semibold text-ink">Document submission validator · manual self-check</summary>
            <div className="mt-3 space-y-4">
              {track === "embassy" && <CycleWorksheet key={JSON.stringify([worksheetAccountId, program, track, subtype, "embassy"])}
                accountId={worksheetAccountId} scope={JSON.stringify(["packet", program, track, subtype, "embassy"])}
                groups={PACKET_GROUPS} title="Embassy / first-round packet" description="Use the specific embassy notice. No documents are uploaded or inspected, and this worksheet does not certify readiness or eligibility." />}
              {track === "university" && universities.length === 0 && <p className="text-[13px] text-muted">Choose a university above to open its individual document packet review.</p>}
              {track === "university" && universities.map(u => <CycleWorksheet key={JSON.stringify([worksheetAccountId, program, track, subtype, u.name, u.major])}
                accountId={worksheetAccountId} scope={JSON.stringify(["packet", program, track, subtype, u.name, u.major])}
                groups={PACKET_GROUPS} title={u.name + " · submission packet"} description="Check the exact recipient instructions against your physical or electronic packet. Unknown remains unknown; no official verification or universal copy count is implied." />)}
            </div>
          </details>
        </section>
      )}
    </main>
  );
}
