import { OFFICIAL_UNIVERSITY_QUOTA } from "@/lib/validation/university-eligibility";
import type { ApplicantDocumentState, ReadinessItem } from "./schema";

/**
 * The multi-university application model.
 *
 * Client-safe on purpose (no dataset imports): the checklist component needs
 * the quota rules and the storage shape, and neither depends on the 338 KB
 * requirement dataset.
 */

export interface UniversityChoice {
  /** Requirement-dataset university name -- the stable identity everywhere. */
  name: string;
  /** Optional per-university department. One major does not apply to all slots. */
  major: string;
}

export interface ApplicationConfig {
  program: string;
  track: string;
  subtype: string;
  universities: UniversityChoice[];
}

/**
 * How many universities this route actually permits.
 *
 * Read from the quotas KMate already encodes in
 * lib/validation/university-eligibility.ts rather than restated here, so the
 * two cannot drift. One deliberate difference: that module adds a KMate-only
 * `BONUS_PICKS` allowance on top of the official figure for its planning
 * picker. Readiness models the real application, so it uses the official
 * quota without the bonus.
 *
 * The direct-to-university routes (UIC, Associate Degree) carry no embassy
 * quota at all -- the same module says so -- so they fall back to the
 * platform-wide cap of 4 rather than borrowing an embassy number that does not
 * apply to them.
 */
const PLATFORM_CAP = 4;

export function universitySlotsFor(program: string, track: string, subtype: string): number {
  if (program === "GKS-G") return OFFICIAL_UNIVERSITY_QUOTA.gks_g;
  if (program === "GKS-U" && track === "embassy") {
    // R-GKS is the only route with a smaller official quota. With no program
    // type chosen yet the wider General figure is used, and the helper text
    // below says the quota narrows once R-GKS is picked.
    return subtype === "r_gks" ? OFFICIAL_UNIVERSITY_QUOTA.r_gks : OFFICIAL_UNIVERSITY_QUOTA.general_overseas;
  }
  if (program === "GKS-U" && track === "university") return PLATFORM_CAP;
  return PLATFORM_CAP;
}

export function describeSlots(program: string, track: string, subtype: string): string {
  const n = universitySlotsFor(program, track, subtype);
  if (program === "GKS-G") return `GKS-G applicants may name up to ${n} universities.`;
  if (program === "GKS-U" && track === "embassy") {
    return subtype === "r_gks"
      ? `Regional (R-GKS) applicants may name up to ${n} universities.`
      : `Embassy Track applicants may name up to ${n} universities. Choosing R-GKS narrows this to ${OFFICIAL_UNIVERSITY_QUOTA.r_gks}.`;
  }
  return `Applying directly through a university carries no embassy quota — up to ${n} here.`;
}

/* ------------------------------------------------------------------ *
 * Stored progress
 * ------------------------------------------------------------------ */

export const STORAGE_PREFIX = "kmate:readiness:app:v2:";

export interface StoredProgress {
  /** Progress on the national checklist, which exists once per application. */
  common: Record<string, ApplicantDocumentState>;
  /**
   * Progress on each university's own extras, keyed by university NAME rather
   * than by slot position. Reordering or removing a university therefore
   * cannot disturb another one's progress, and a university that is removed
   * and added back returns with its own ticks intact.
   */
  byUniversity: Record<string, Record<string, ApplicantDocumentState>>;
}

export const EMPTY_PROGRESS: StoredProgress = { common: {}, byUniversity: {} };

/**
 * One key per application route, NOT per university.
 *
 * Keying on the university list would mean reordering or dropping a slot
 * produced a different key and silently abandoned the applicant's work. The
 * selected universities live inside the record instead.
 */
export function storageKeyFor(program: string, track: string, subtype: string): string {
  return `${STORAGE_PREFIX}${program}|${track}|${subtype}`;
}

export function parseProgress(raw: string | null): StoredProgress {
  if (!raw) return EMPTY_PROGRESS;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProgress>;
    return {
      common: parsed.common ?? {},
      byUniversity: parsed.byUniversity ?? {},
    };
  } catch {
    // A corrupt entry starts clean rather than breaking the workspace.
    return EMPTY_PROGRESS;
  }
}

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

export interface UniversitySection {
  university: string;
  major: string;
  items: ReadinessItem[];
}

export interface ApplicationReadiness {
  /** The national checklist. Rendered once, however many universities are chosen. */
  common: ReadinessItem[];
  universities: UniversitySection[];
  warnings: string[];
}

export interface SectionProgress {
  requiredTotal: number;
  requiredReady: number;
  requiredMissing: number;
  /** Required items with no progress state yet. */
  untracked: number;
  conditionalTotal: number;
  optionalTotal: number;
  /** Every item in the section, required or not. */
  itemTotal: number;
}

/**
 * Counts one section -- the common checklist, or one university's overlay.
 *
 * Completion is measured against REQUIRED items only. A conditional or
 * optional document left untouched is not an outstanding obligation, so it
 * must never drag the percentage down; those are counted separately and shown
 * beside the bar instead.
 */
export function progressOf(items: ReadinessItem[]): SectionProgress {
  const required = items.filter((i) => i.status === "required");
  return {
    requiredTotal: required.length,
    requiredReady: required.filter((i) => i.progress === "ready").length,
    requiredMissing: required.filter((i) => i.progress === "missing").length,
    untracked: required.filter((i) => i.progress === "untracked").length,
    conditionalTotal: items.filter((i) => i.status === "conditional").length,
    optionalTotal: items.filter((i) => i.status === "optional").length,
    itemTotal: items.length,
  };
}

/**
 * The whole application: the common checklist plus every selected university's
 * required items.
 *
 * A university with no required items of its own contributes nothing to either
 * side of the fraction rather than an invented denominator, so three
 * universities where two have requirements read as a total over those two.
 * `percent` is null until there is something to measure, so an application with
 * no required items anywhere shows no figure instead of a misleading 100%.
 */
export function overallProgress(common: SectionProgress, universities: SectionProgress[]): SectionProgress & {
  percent: number | null;
  universitiesWithOutstanding: number;
  universitiesCounted: number;
} {
  const parts = [common, ...universities];
  const sum = (pick: (p: SectionProgress) => number) => parts.reduce((n, p) => n + pick(p), 0);

  const requiredTotal = sum((p) => p.requiredTotal);
  const requiredReady = sum((p) => p.requiredReady);

  return {
    requiredTotal,
    requiredReady,
    requiredMissing: sum((p) => p.requiredMissing),
    untracked: sum((p) => p.untracked),
    conditionalTotal: sum((p) => p.conditionalTotal),
    optionalTotal: sum((p) => p.optionalTotal),
    itemTotal: sum((p) => p.itemTotal),
    percent: requiredTotal === 0 ? null : Math.round((requiredReady / requiredTotal) * 100),
    // "Unresolved" means a required item this university still owes -- not yet
    // ready, whether that is missing, in progress or untouched.
    universitiesWithOutstanding: universities.filter((p) => p.requiredTotal > p.requiredReady).length,
    universitiesCounted: universities.length,
  };
}

/** A stable DOM id for a university's detail section, for the summary cards to jump to. */
export function universityAnchor(name: string): string {
  return "uni-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
