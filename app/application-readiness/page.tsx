import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { buildCheckerOptions } from "@/lib/requirements/options";
import { getApplicationWorkspace } from "@/lib/readiness";
import { getProfileDefaults } from "@/lib/readiness/profile";
import { universitySlotsFor } from "@/lib/readiness/application";
import { ReadinessWorkspace } from "@/components/readiness/readiness-workspace";

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

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">Application Readiness</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        Your 2026 GKS application in one place: the documents every applicant files, plus whatever each
        university you have chosen additionally requires.
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

      <div className="mt-6">
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
    </main>
  );
}
