import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { checkUniversityRequirements, requirementDataset } from "@/lib/requirements";
import { buildCheckerOptions, subtypeEvidence } from "@/lib/requirements/options";
import type { CheckerInput } from "@/lib/requirements/matcher";
import { RequirementForm } from "@/components/requirements/requirement-form";
import { RequirementResults } from "@/components/requirements/requirement-results";

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
  await requireOnboarded("/requirement-checker");
  const params = await searchParams;
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

  // The matcher is called with the TOP-LEVEL track, exactly as before; the
  // sub-route is applied afterwards so matcher.ts stays untouched.
  const matched = checked
    ? checkUniversityRequirements({
        program: program as CheckerInput["program"],
        trackFamily: track,
        university,
        ...(major ? { major } : {}),
        ...(gender ? { gender: gender as CheckerInput["gender"] } : {}),
      })
    : [];

  const subtypeLabel = (trackOption?.subtypes ?? []).find((s) => s.value === subtype)?.label ?? "";

  const results = subtype
    ? matched
        .filter((r) => subtypeEvidence(r.record, subtype).matches)
        // A record kept because its source never distinguished the sub-routes
        // says so, rather than being presented as verified for this one.
        .map((r) =>
          subtypeEvidence(r.record, subtype).stated
            ? r
            : {
                ...r,
                notes: [
                  ...r.notes,
                  `${subtypeLabel} is not specifically stated by this source — it verifies the ${
                    trackOption?.label ?? "track"
                  } only.`,
                ],
              }
        )
    : matched;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">
        University Requirement Checker
      </h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        Pick your program, track and university to see what that university&apos;s own official GKS source
        states. Requirements are never combined across tracks — for GKS-U, Embassy and University routes stay
        separate, each with its own sub-routes.
      </p>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-canvas px-3.5 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <p className="text-[12.5px] leading-relaxed text-muted">
          {`Based on the latest verified ${requirementDataset.cycle} GKS information in KMate's dataset (${requirementDataset.record_count} university records).`}{" "}
          Where a source does not state something,
          this says <span className="font-medium text-ink">Not stated</span> rather than guessing — it never
          infers that a requirement does not exist, and never falls back to ordinary international-admission
          rules.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-5">
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
          {checked ? <RequirementResults results={results} /> : null}
        </RequirementForm>
      </div>
    </main>
  );
}
