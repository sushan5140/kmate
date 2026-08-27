import "server-only";
import { requirementDataset } from "./index";
import type { GKSProgram, RequirementRecord } from "./schema";

/**
 * Builds the cascading option tree for the Requirement Checker form.
 *
 * The dataset is 338 KB, so it stays on the server: the client is handed only
 * the names it needs to render the selects, and matching runs server-side from
 * the URL. That also keeps the page linkable.
 *
 * Track families are the unit of filtering because that is what the matcher
 * filters on, and because they keep Embassy separate from University / UIC /
 * R&D / Global Network -- a record belongs to every family it is listed under,
 * so a university appearing under two tracks appears under both, never merged.
 */

export const TRACK_LABELS: Record<string, string> = {
  embassy: "Embassy Track",
  university: "University Track",
  uic: "UIC",
  rd: "R&D",
  global_network: "Global Network",
  r_gks: "R-GKS",
  research: "Research",
  general: "General",
  other: "Other",
};

/** Presentation order: the tracks applicants pick most, first. */
const TRACK_ORDER = [
  "embassy",
  "university",
  "uic",
  "rd",
  "global_network",
  "r_gks",
  "research",
  "general",
  "other",
];

export interface SubtypeOption {
  value: string;
  label: string;
  /** Records with evidence for this subtype. */
  count: number;
}

export interface TrackOption {
  value: string;
  label: string;
  /** How many dataset records sit under this track, shown as a hint. */
  count: number;
  /**
   * Sub-routes of this track. Only GKS-U has them -- GKS-G keeps the flat
   * family list it already used, because its routes are genuinely parallel.
   */
  subtypes?: SubtypeOption[];
}

/**
 * The real 2026 GKS-U shape:
 *
 *   Embassy Track -> General, R-GKS
 *   University Track -> UIC, Associate Degree
 *
 * `general`, `uic` and `r_gks` are internal classification families, not
 * tracks an applicant chooses between. Exposing them as peers produced five
 * top-level options and stranded Jeju as the lone "General" university --
 * only because Jeju's source happens to spell out "General or R-GKS" while
 * the other 69 Embassy sources simply don't mention the distinction.
 */
const UG_TRACKS = ["embassy", "university"] as const;

const UG_SUBTYPES: Record<string, { value: string; label: string }[]> = {
  embassy: [
    { value: "general", label: "General" },
    { value: "r_gks", label: "R-GKS" },
  ],
  university: [
    { value: "uic", label: "UIC" },
    { value: "associate", label: "Associate Degree" },
  ],
};

/**
 * Whether a record has evidence for a subtype, and whether that evidence is
 * explicit.
 *
 * "General" is the default Embassy route, so an Embassy record that never
 * distinguishes General from R-GKS still belongs there -- it is reported as
 * `stated: false` rather than hidden, which is what stops a verified
 * university disappearing because its source was simply less specific.
 *
 * R-GKS is the opposite case: a named sub-programme. Only records that
 * actually cite it are shown, because listing 67 silent universities under
 * R-GKS would invent participation nobody verified.
 */
export function subtypeEvidence(
  record: RequirementRecord,
  subtype: string
): { matches: boolean; stated: boolean } {
  const families = record.track_families;
  switch (subtype) {
    case "general":
      return { matches: families.includes("embassy"), stated: families.includes("general") };
    case "r_gks":
      return { matches: families.includes("r_gks"), stated: families.includes("r_gks") };
    case "uic":
      return { matches: families.includes("uic"), stated: families.includes("uic") };
    case "associate": {
      // degree_level is verified data, so a bachelor record is positive
      // evidence of NOT being an associate route -- not missing information.
      const isAssociate = record.flags.associate_degree || record.degree_level === "associate";
      return { matches: isAssociate, stated: isAssociate };
    }
    default:
      return { matches: true, stated: false };
  }
}

export interface SelectionMeta {
  /**
   * True when a record for this selection carries a gender rule. The gender
   * field is only rendered then -- no profile detail is requested unless a
   * verified structured rule actually uses it.
   */
  needsGender: boolean;
  /**
   * Majors that appear as `major equals` values in structured rules. These are
   * the only normalized majors in the dataset; the prose in
   * requirements.majors_departments is never parsed into options, because
   * inventing majors out of it is exactly what the data rules forbid.
   */
  majorSuggestions: string[];
}

export interface CheckerOptions {
  programs: { value: GKSProgram; label: string }[];
  tracks: Record<string, TrackOption[]>;
  /** Keyed `${program}|${track}`. */
  universities: Record<string, string[]>;
  /** Keyed `${program}|${track}|${university}`; only non-default entries. */
  meta: Record<string, SelectionMeta>;
}

const PROGRAM_LABELS: Record<GKSProgram, string> = {
  "GKS-U": "Undergraduate (GKS-U)",
  "GKS-G": "Graduate (GKS-G)",
};

function genderRuleFor(record: RequirementRecord): boolean {
  return record.structured_rules.some(
    (rule) => rule.field === "gender" || rule.field === "gender_major_restriction"
  );
}

function majorRulesFor(record: RequirementRecord): string[] {
  return record.structured_rules
    .filter((rule) => rule.field === "major" && rule.operator === "equals")
    .map((rule) => rule.value);
}

export function buildCheckerOptions(): CheckerOptions {
  const records = requirementDataset.records;

  const programs = (Object.keys(PROGRAM_LABELS) as GKSProgram[])
    .filter((p) => records.some((r) => r.program === p))
    .map((value) => ({ value, label: PROGRAM_LABELS[value] }));

  const tracks: Record<string, TrackOption[]> = {};
  const universities: Record<string, string[]> = {};
  const meta: Record<string, SelectionMeta> = {};

  for (const program of programs.map((p) => p.value)) {
    const inProgram = records.filter((r) => r.program === program);

    const counts = new Map<string, number>();
    for (const record of inProgram) {
      for (const family of record.track_families) {
        counts.set(family, (counts.get(family) ?? 0) + 1);
      }
    }

    if (program === "GKS-U") {
      // Two real tracks, each with its own sub-routes.
      tracks[program] = UG_TRACKS.filter((t) => counts.has(t)).map((value) => ({
        value,
        label: TRACK_LABELS[value] ?? value,
        count: counts.get(value) ?? 0,
        subtypes: (UG_SUBTYPES[value] ?? [])
          .map((s) => ({
            ...s,
            count: inProgram.filter(
              (r) => r.track_families.includes(value) && subtypeEvidence(r, s.value).matches
            ).length,
          }))
          .filter((s) => s.count > 0),
      }));
    } else {
      // GKS-G is untouched: its families really are parallel routes.
      tracks[program] = [...counts.entries()]
        .sort((a, b) => {
          const ia = TRACK_ORDER.indexOf(a[0]);
          const ib = TRACK_ORDER.indexOf(b[0]);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        })
        .map(([value, count]) => ({ value, label: TRACK_LABELS[value] ?? value, count }));
    }

    // University lists are still built per family so a GKS-U record reachable
    // only through a sub-family (never the case today, but cheap to keep)
    // cannot vanish; the UI only offers the top-level ones.
    for (const family of counts.keys()) {
      const matching = inProgram.filter((r) => r.track_families.includes(family));
      universities[`${program}|${family}`] = [...new Set(matching.map((r) => r.university))].sort(
        (a, b) => a.localeCompare(b)
      );

      for (const university of new Set(matching.map((r) => r.university))) {
        // A university can hold several records under one track; the field is
        // needed if ANY of them uses it.
        const forUni = matching.filter((r) => r.university === university);
        const needsGender = forUni.some(genderRuleFor);
        const majorSuggestions = [...new Set(forUni.flatMap(majorRulesFor))];
        if (needsGender || majorSuggestions.length) {
          meta[`${program}|${family}|${university}`] = { needsGender, majorSuggestions };
        }
      }
    }

    // Subtype-scoped university lists, so picking "Associate Degree" narrows
    // the dropdown to the three universities that verifiably offer it.
    for (const track of tracks[program] ?? []) {
      for (const sub of track.subtypes ?? []) {
        const matching = inProgram.filter(
          (r) => r.track_families.includes(track.value) && subtypeEvidence(r, sub.value).matches
        );
        universities[`${program}|${track.value}|${sub.value}`] = [
          ...new Set(matching.map((r) => r.university)),
        ].sort((a, b) => a.localeCompare(b));
      }
    }
  }

  return { programs, tracks, universities, meta };
}

export function metaFor(
  options: CheckerOptions,
  program: string,
  track: string,
  university: string
): SelectionMeta {
  return (
    options.meta[`${program}|${track}|${university}`] ?? { needsGender: false, majorSuggestions: [] }
  );
}
