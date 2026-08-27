import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { buildCheckerOptions } from "@/lib/requirements/options";
import { getApplicationReadiness } from "@/lib/readiness";
import { ReadinessForm } from "@/components/readiness/readiness-form";
import { ReadinessChecklist } from "@/components/readiness/readiness-checklist";

export const metadata: Metadata = {
  title: "Application Readiness — KMate",
};

interface SearchParams {
  program?: string;
  track?: string;
  subtype?: string;
  university?: string;
  major?: string;
}

export default async function ApplicationReadinessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireOnboarded("/application-readiness");
  const params = await searchParams;

  // The option tree is the Requirement Checker's own, so tracks, program types
  // and university lists cannot drift between the two pages -- there is no
  // second hierarchy and no second university list to keep in step.
  const options = buildCheckerOptions();

  const program = options.programs.some((p) => p.value === params.program) ? params.program! : "";
  const track =
    program && (options.tracks[program] ?? []).some((t) => t.value === params.track)
      ? params.track!
      : "";
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

  // The national checklist stands on its own: a program is all that is needed
  // for it to render. University, track and major only ever ADD verified
  // university-specific items -- they never remove a national requirement.
  const readiness = program
    ? getApplicationReadiness({
        program: program as "GKS-U" | "GKS-G",
        ...(university ? { university } : {}),
        ...(track ? { trackFamily: track } : {}),
        ...(subtype ? { subtype } : {}),
        ...(major ? { selectedMajor: major } : {}),
      })
    : null;

  const meta = options.meta[`${program}|${track}|${university}`] ?? {
    needsGender: false,
    majorSuggestions: [] as string[],
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">Application Readiness</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        The 2026 GKS document checklist for your program, plus any verified extra documents your chosen
        university requires. Track what you have prepared and what is still outstanding.
      </p>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-canvas px-3.5 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <p className="text-[12.5px] leading-relaxed text-muted">
          This is a preparation aid, not an eligibility decision. Where an official source does not state
          something, it says <span className="font-medium text-ink">Not stated</span> rather than guessing —
          a document KMate has no rule for is never presented as{" "}
          <span className="font-medium text-ink">not required</span>.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-5">
        <ReadinessForm
          key={`${program}|${track}|${subtype}|${university}|${major}`}
          options={options}
          majorSuggestions={meta.majorSuggestions}
          initial={{ program, track, subtype, university, major }}
        />

        {readiness && (
          // Keyed on the configuration the checklist belongs to, so switching
          // university remounts with that university's own stored progress
          // instead of carrying the previous one's over.
          <ReadinessChecklist
            key={`${program}|${track}|${subtype}|${university}`}
            storageKey={`${program}|${track}|${subtype}|${university}`}
            items={readiness.items}
            warnings={readiness.warnings}
          />
        )}
      </div>
    </main>
  );
}
