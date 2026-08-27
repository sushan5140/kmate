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
 * Tracks are modelled as a hierarchy per program (see HIERARCHY below), not as
 * the raw track_families list: those families are internal classification tags,
 * and rendering them as peers is what produced five top-level GKS-U options and
 * eight GKS-G ones. A record belongs to every route it is listed under, so a
 * university appearing under two tracks appears under both, never merged.
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
  other: "Track not specified",
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
  /** Program types within this track, empty where the dataset supports none. */
  subtypes?: SubtypeOption[];
}

interface TrackSpec {
  value: string;
  subtypes: { value: string; label: string }[];
}

/**
 * The real 2026 track shape per program. Two levels, always: the top level is
 * the route an applicant applies through, the second is the program type
 * within it.
 *
 * GKS-U:
 *   Embassy Track    -> General, R-GKS
 *   University Track -> UIC, Associate Degree
 *
 * GKS-G:
 *   Embassy Track    -> General
 *   University Track -> General, R-GKS, Research, R&D, Global Network
 *
 * `general`, `uic`, `rd` and friends are internal classification families, not
 * routes an applicant chooses between. Exposing them as peers is what produced
 * eight flat GKS-G chips and five GKS-U ones. There is deliberately no "Other"
 * bucket: `other` means the source named no track, which is a property of the
 * evidence, not a route -- see trackEvidence() for how those records surface.
 */
const HIERARCHY: Record<string, TrackSpec[]> = {
  "GKS-U": [
    {
      value: "embassy",
      subtypes: [
        { value: "general", label: "General" },
        { value: "r_gks", label: "R-GKS" },
      ],
    },
    {
      value: "university",
      subtypes: [
        { value: "uic", label: "UIC" },
        { value: "associate", label: "Associate Degree" },
      ],
    },
  ],
  "GKS-G": [
    { value: "embassy", subtypes: [{ value: "general", label: "General" }] },
    {
      value: "university",
      subtypes: [
        { value: "general", label: "General" },
        { value: "r_gks", label: "R-GKS" },
        { value: "research", label: "Research" },
        { value: "rd", label: "R&D" },
        { value: "global_network", label: "Global Network" },
      ],
    },
  ],
};

/**
 * Program types that exist only under University Track, so naming one places
 * the record there even if the row also cites Embassy for a different route.
 * `general` and `r_gks` are deliberately absent: both programs offer them
 * under Embassy Track too, so they imply nothing about the route.
 */
const UNIVERSITY_ONLY = ["uic", "rd", "global_network", "research"];

/**
 * Whether a record belongs under a top-level track, and whether its own source
 * says so.
 *
 * A record reaches a track one of two ways, and there is no third:
 *
 *  1. Its source names that track.
 *  2. Its source names a program type that exists only under University Track
 *     (R&D, Global Network, Research, UIC). That is enough on its own: GKS-G's
 *     30 specialisation-only rows come from the guideline's R&D and Global
 *     Network tables, which never restate the route. The same branch places
 *     Ajou's row, "General + Specialized R&D; Embassy also available for
 *     General", under both tracks -- `embassy` describes its General route and
 *     `rd` a University one, so testing the top-level family alone would file
 *     it under Embassy and lose a real R&D university.
 *
 * Anything else matches NEITHER track. That covers GKS-G's 24 rows which only
 * confirm the university participates ("2026 GKS-G participating university /
 * Type A|B") and the 1 row naming a program type offered on both routes:
 * participation is not evidence of Embassy or University Track eligibility, so
 * those universities stay out of route-specific lists until an official source
 * verifies the route. The records are kept in the dataset and are not given an
 * "Other" bucket -- they are simply withheld from track filtering.
 *
 * GKS-U never reaches the last case: all 83 of its records name a track.
 */
export function trackEvidence(
  record: RequirementRecord,
  track: string
): { matches: boolean; stated: boolean } {
  const has = (f: string) => record.track_families.includes(f);
  if (has(track)) return { matches: true, stated: true };
  if (UNIVERSITY_ONLY.some(has)) return { matches: track === "university", stated: false };
  return { matches: false, stated: false };
}

export function subtypeEvidence(
  record: RequirementRecord,
  subtype: string,
  topLevel = ""
): { matches: boolean; stated: boolean } {
  const has = (f: string) => record.track_families.includes(f);

  // degree_level is verified data, so a bachelor record is positive evidence
  // of NOT being an associate route -- not missing information.
  if (subtype === "associate") {
    const isAssociate = record.flags.associate_degree || record.degree_level === "associate";
    return { matches: isAssociate, stated: isAssociate };
  }

  // General is the default Embassy route in both programs: an Embassy record
  // that never distinguishes General from R-GKS still belongs there, reported
  // as stated:false rather than hidden. That is what stops a verified
  // university disappearing because its source was simply less specific.
  //
  // Membership deliberately mirrors trackEvidence rather than testing
  // `embassy` directly. General is the *only* program type Embassy Track has,
  // so anything the track admits the type must admit too -- otherwise picking
  // the sole type would narrow the list for no reason and look like a bug.
  // University Track's five types get no such rule, because there a record
  // that named no type really would have to be guessed into one of them.
  if (subtype === "general" && topLevel === "embassy") {
    return { matches: trackEvidence(record, "embassy").matches, stated: has("general") };
  }

  // Everything else is a named sub-route: a record qualifies when it cites
  // that sub-route, and the top-level family only decides whether the pairing
  // is *stated* or merely implied.
  //
  // Citing the sub-route is deliberately enough on its own. GKS-G's 31
  // specialisation-only records (the guideline's R&D and Global Network
  // tables) name the specialisation without repeating the track, and a record
  // can name a track for one route while another route belongs elsewhere --
  // Ajou's row reads "General + Specialized R&D; Embassy also available for
  // General", where `embassy` describes its General route, not its R&D one.
  // Requiring the top-level family would have dropped both kinds, losing real
  // R&D universities; retagging them in the dataset would assert a track their
  // own row never states. Marking them instead keeps them findable and honest.
  const matchesSub = has(subtype);
  if (!topLevel) return { matches: matchesSub, stated: matchesSub };
  return { matches: matchesSub, stated: matchesSub && has(topLevel) };
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

    const spec = HIERARCHY[program];
    if (spec) {
      tracks[program] = spec
        .map((t) => {
          const inTrack = inProgram.filter((r) => trackEvidence(r, t.value).matches);
          return {
            value: t.value,
            label: TRACK_LABELS[t.value] ?? t.value,
            count: inTrack.length,
            subtypes: t.subtypes
              .map((sub) => ({
                ...sub,
                count: inTrack.filter((r) => subtypeEvidence(r, sub.value, t.value).matches).length,
              }))
              // A subtype the dataset cannot support for this track is not offered.
              .filter((sub) => sub.count > 0),
          };
        })
        .filter((t) => t.count > 0);
    } else {
      // Any future program with no declared hierarchy falls back to the flat
      // family list rather than silently losing its tracks.
      tracks[program] = [...counts.entries()]
        // `other` is an evidence tag, never a route to offer.
        .filter(([value]) => value !== "other")
        .sort((a, b) => {
          const ia = TRACK_ORDER.indexOf(a[0]);
          const ib = TRACK_ORDER.indexOf(b[0]);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        })
        .map(([value, count]) => ({ value, label: TRACK_LABELS[value] ?? value, count }));
    }

    for (const track of tracks[program] ?? []) {
      const inTrack = inProgram.filter((r) => trackEvidence(r, track.value).matches);
      universities[`${program}|${track.value}`] = [...new Set(inTrack.map((r) => r.university))].sort(
        (a, b) => a.localeCompare(b)
      );

      for (const university of new Set(inTrack.map((r) => r.university))) {
        // A university can hold several records under one track; the field is
        // needed if ANY of them uses it.
        const forUni = inTrack.filter((r) => r.university === university);
        const needsGender = forUni.some(genderRuleFor);
        const majorSuggestions = [...new Set(forUni.flatMap(majorRulesFor))];
        if (needsGender || majorSuggestions.length) {
          meta[`${program}|${track.value}|${university}`] = { needsGender, majorSuggestions };
        }
      }

      // Subtype-scoped lists, so picking "Associate Degree" narrows the
      // dropdown to the three universities that verifiably offer it.
      for (const sub of track.subtypes ?? []) {
        const matching = inTrack.filter((r) => subtypeEvidence(r, sub.value, track.value).matches);
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
