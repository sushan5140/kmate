import type { Metadata } from "next";
import { Database, ExternalLink, FileText, Lightbulb, Route, ShieldCheck } from "lucide-react";
import { Card, MicroLabel } from "@/components/ui/card";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { checkUniversityRequirements, requirementDataset } from "@/lib/requirements";
import { buildCheckerOptions, subtypeEvidence, trackEvidence } from "@/lib/requirements/options";
import type { CheckerInput } from "@/lib/requirements/matcher";
import { RequirementForm } from "@/components/requirements/requirement-form";
import { RequirementResults } from "@/components/requirements/requirement-results";
import { getProfileDefaults } from "@/lib/readiness/profile";
import { GksU2027TrackComparator } from "@/components/official-guidelines/gks-u-2027-track-comparator";
import { GksU2027SmartTools } from "@/components/official-guidelines/gks-u-2027-smart-tools";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "University Requirement Checker — KMate",
};

interface SearchParams {
  program?: string;
  track?: string;
  subtype?: string;
  university?: string;
  major?: string;
  gender?: string;
  check?: string;
}

const GENDERS = ["female", "male", "other", "prefer_not_to_say"] as const;

export default async function RequirementCheckerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireOnboarded("/requirement-checker");
  const params = await searchParams;
  const defaults = await getProfileDefaults(user.id);
  const options = buildCheckerOptions();

  // Every selection is validated against the dataset's own option tree before
  // it reaches the matcher, so a hand-edited URL cannot ask for a track or
  // university that does not exist.
  const program = options.programs.some((p) => p.value === params.program) ? params.program! : "";
  const track =
    program && (options.tracks[program] ?? []).some((t) => t.value === params.track)
      ? params.track!
      : "";
  // Only a sub-route the selected track actually declares is accepted.
  const trackOption = program ? (options.tracks[program] ?? []).find((t) => t.value === track) : undefined;
  const subtype = (trackOption?.subtypes ?? []).some((s) => s.value === params.subtype)
    ? params.subtype!
    : "";

  const universityPool = subtype
    ? options.universities[`${program}|${track}|${subtype}`] ?? []
    : options.universities[`${program}|${track}`] ?? [];
  const university =
    program && track && universityPool.includes(params.university ?? "") ? params.university! : "";
  const major = typeof params.major === "string" ? params.major.slice(0, 120) : "";
  const gender = GENDERS.includes(params.gender as (typeof GENDERS)[number]) ? params.gender! : "";

  const checked = params.check === "1" && Boolean(program && track && university);

  // Track scoping happens here rather than inside the matcher, so matcher.ts
  // stays untouched.
  //
  // trackFamily is deliberately NOT passed: GKS-G's specialisation-only
  // records (the guideline's R&D and Global Network tables) carry no
  // top-level family, so the matcher's own family filter would drop them
  // before the sub-route filter below ever ran -- selecting
  // University Track -> R&D would have reported "no record". Scope is applied
  // here instead, using the same evidence rule the option tree was built from.
  const matched = checked
    ? checkUniversityRequirements({
        program: program as CheckerInput["program"],
        university,
        ...(major ? { major } : {}),
        ...(gender ? { gender: gender as CheckerInput["gender"] } : {}),
      })
    : [];

  const subtypeLabel = (trackOption?.subtypes ?? []).find((s) => s.value === subtype)?.label ?? "";

  const trackLabel = trackOption?.label ?? "this track";

  // Scope by top-level track, then by sub-route when one is chosen. Both use
  // the same evidence rules the option tree was built from.
  const inTrack = matched.filter((r) => {
    if (!trackEvidence(r.record, track).matches) return false;
    return subtype ? subtypeEvidence(r.record, subtype, track).matches : true;
  });

  // A record kept because its source was less specific says so, rather than
  // being presented as verified for a route it never named.
  const results = inTrack.map((r) => {
    const notes = [...r.notes];
    if (!trackEvidence(r.record, track).stated) {
      notes.push(
        `${trackLabel} is not specifically stated by this source — it names the program type without restating the track.`
      );
    }
    if (subtype && !subtypeEvidence(r.record, subtype, track).stated) {
      notes.push(`${subtypeLabel} is not specifically stated by this source.`);
    }
    return notes.length === r.notes.length ? r : { ...r, notes };
  });

  const showGksU2027 = program === "GKS-U" || (!program && defaults.program === "GKS-U");
  const selectedProgram = (program || defaults.program || "GKS-U") as "GKS-U" | "GKS-G";
  const selectedCycle =
    requirementDataset.program_cycles?.[selectedProgram] ??
    (selectedProgram === "GKS-U" ? "2027" : requirementDataset.cycle);
  const toolTrack = program === "GKS-U" && track ? track : defaults.track;
  const toolSubtype = program === "GKS-U" && track ? subtype : defaults.subtype;
  const toolPath =
    toolTrack === "embassy" ? (toolSubtype === "r_gks" ? "r_gks" : "general") : null;
  const toolUniversities = university ? [university] : defaults.universities;
  const toolMajor = major || defaults.major;

  return (
    <main className="workspace-page mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PageHeader eyebrow="University rules" title="Requirement Checker" description="Choose the exact program, route, and university. Embassy and University Track evidence stays separate, with source age visible." meta={<span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[9.5px] font-extrabold text-muted ring-1 ring-hairline"><Database className="h-3 w-3" />{selectedProgram} {selectedCycle} · {requirementDataset.record_count} source-tagged records</span>} />

      {/* Form and results lead; the guidance panel sits alongside on desktop
          and drops below the form on narrow screens. */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="flex flex-col gap-5">
          {/* Keyed on the checked selection so every navigation -- Check, Reset,
              or the browser's back/forward -- remounts the form with the props
              the server just rendered. Without this the form keeps whatever
              local state it had from mount, and the URL and the fields drift
              apart permanently. */}
          <RequirementForm
            key={`${program}|${track}|${subtype}|${university}|${major}|${gender}|${checked}`}
            options={options}
            initial={{ program, track, subtype, university, major, gender }}
          >
            {checked ? (
              <RequirementResults
                results={results}
                selection={{
                  program,
                  trackLabel: trackOption?.label,
                  subtypeLabel: subtypeLabel || undefined,
                }}
              />
            ) : null}
          </RequirementForm>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <Card className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                <Lightbulb className="h-3.5 w-3.5 text-primary" />
              </span>
              <MicroLabel>How to use</MicroLabel>
            </div>
            <ul className="flex flex-col gap-3">
              <Guide icon={<FileText className="h-3.5 w-3.5" />}>
                This page shows what each university&apos;s own official GKS source states — nothing is
                inferred from what similar universities require.
              </Guide>
              <Guide icon={<Route className="h-3.5 w-3.5" />}>
                Embassy and University routes stay separate. A university can appear under both with
                different requirements.
              </Guide>
              <Guide icon={<ExternalLink className="h-3.5 w-3.5" />}>
                Open the official source on each result before you rely on it. Each result shows whether its
                university-specific detail is current-cycle or carried forward from an older official source.
              </Guide>
              <Guide icon={<ShieldCheck className="h-3.5 w-3.5" />}>
                Where a source does not state something, this says{" "}
                <span className="font-medium text-ink">Not stated</span> rather than guessing — it never
                infers that a requirement does not exist, and never falls back to ordinary
                international-admission rules.
              </Guide>
            </ul>
            <p className="border-t border-hairline pt-3 text-[11.5px] text-muted">
              {selectedProgram === "GKS-U"
                ? "2027 national route/type/UIC eligibility is current. University-specific language, process and extra-document details keep their own source-cycle label and are never silently presented as 2027 when only an older official source is available."
                : `Based on the latest verified ${selectedCycle} ${selectedProgram} information in KMate's dataset (${requirementDataset.record_count} cycle-tagged records).`}
            </p>
          </Card>
        </aside>
      </div>

      {showGksU2027 && (
        <section className="mt-8 rounded-[24px] border border-hairline bg-surface/72 p-4 shadow-card sm:p-6">
          <GksU2027TrackComparator defaultPath={toolPath} defaultMajor={toolMajor} />
          <GksU2027SmartTools
            mode="requirements"
            defaultPath={toolPath}
            savedUniversities={toolUniversities}
            defaultMajor={toolMajor}
          />
        </section>
      )}
    </main>
  );
}

function Guide({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <p className="text-[12.5px] leading-relaxed text-muted">{children}</p>
    </li>
  );
}
