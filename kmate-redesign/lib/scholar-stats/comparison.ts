import type { CachedGksCrossTabRow, CachedGksUniversityStat } from "@/lib/cached-content";
import type { EmbassyType } from "@/lib/constants";

/**
 * Pure derivation for the two-university comparison. Everything here works off
 * the same rows the Scholar Stats table already renders -- no second dataset,
 * no second set of aggregation rules -- so the comparison can never disagree
 * with the numbers shown in the expanded row for the same university.
 */

export interface DegreeLevelCount {
  label: string;
  count: number;
}

export interface UniversitySide {
  name: string;
  embassyType: EmbassyType | null;
  /** Scholars in NIIED's Final Round list recorded at this university. */
  totalScholars: number;
  embassyTrackCount: number;
  universityTrackCount: number;
  countriesRepresented: number;
  degreeLevels: DegreeLevelCount[];
}

export interface CountryShare {
  country: string;
  scholars: number;
  /** Share of this university's own recorded scholars. Null when it has none. */
  pct: number | null;
}

export type Leader = "first" | "second" | "tie";

export interface ComparisonDelta {
  sharedCountries: string[];
  onlyFirstCountries: string[];
  onlySecondCountries: string[];
  scholarsLeader: Leader;
  countriesLeader: Leader;
  /** Degree levels present for either side, so both columns line up row-for-row. */
  degreeLabels: string[];
}

/** "Master's:39;Doctoral:7;Research:1" -> [{ label: "Master's", count: 39 }, ...] */
export function parseDegreeBreakdown(raw: string): DegreeLevelCount[] {
  if (!raw) return [];
  const out: DegreeLevelCount[] = [];
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Degree labels themselves contain colons in no known row, but they DO
    // contain parentheses ("Bachelor's(UIC)"), so split on the LAST colon.
    const at = trimmed.lastIndexOf(":");
    if (at === -1) continue;
    const label = trimmed.slice(0, at).trim();
    const count = Number.parseInt(trimmed.slice(at + 1).trim(), 10);
    if (!label || !Number.isFinite(count)) continue;
    out.push({ label, count });
  }
  return out;
}

export function toUniversitySide(
  stat: CachedGksUniversityStat,
  embassyType: EmbassyType | null
): UniversitySide {
  return {
    name: stat.university,
    embassyType,
    totalScholars: stat.total_selected_count,
    embassyTrackCount: stat.embassy_track_count,
    universityTrackCount: stat.university_track_count,
    countriesRepresented: stat.distinct_country_count,
    degreeLevels: parseDegreeBreakdown(stat.degree_level_breakdown),
  };
}

/**
 * Country distribution for one university. `pct_of_university_seats` is
 * carried straight through rather than recomputed: it is this dataset's own
 * seat_count/total figure, and reusing it keeps the comparison numerically
 * identical to the expanded row in the main table.
 */
export function toCountryShares(rows: readonly CachedGksCrossTabRow[], totalScholars: number): CountryShare[] {
  return [...rows]
    .sort((a, b) => b.seat_count - a.seat_count || a.country.localeCompare(b.country))
    .map((row) => ({
      country: row.country,
      scholars: row.seat_count,
      pct: totalScholars > 0 ? Number(row.pct_of_university_seats) : null,
    }));
}

function compare(a: number, b: number): Leader {
  if (a === b) return "tie";
  return a > b ? "first" : "second";
}

export function deriveComparison(
  first: UniversitySide,
  second: UniversitySide,
  firstCountries: readonly CountryShare[],
  secondCountries: readonly CountryShare[]
): ComparisonDelta {
  const firstNames = new Set(firstCountries.map((c) => c.country));
  const secondNames = new Set(secondCountries.map((c) => c.country));
  const collator = new Intl.Collator();

  const degreeLabels: string[] = [];
  for (const level of [...first.degreeLevels, ...second.degreeLevels]) {
    if (!degreeLabels.includes(level.label)) degreeLabels.push(level.label);
  }

  return {
    sharedCountries: [...firstNames].filter((c) => secondNames.has(c)).sort(collator.compare),
    onlyFirstCountries: [...firstNames].filter((c) => !secondNames.has(c)).sort(collator.compare),
    onlySecondCountries: [...secondNames].filter((c) => !firstNames.has(c)).sort(collator.compare),
    scholarsLeader: compare(first.totalScholars, second.totalScholars),
    countriesLeader: compare(firstNames.size, secondNames.size),
    degreeLabels,
  };
}

/** 33.333 -> "33.3%", 25 -> "25%", null -> "—". Never renders "NaN%". */
export function formatPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  return `${Number(pct.toFixed(1))}%`;
}

/** URL-safe, stable-for-a-given-name slug. "Kookmin University" -> "kookmin-university" */
export function universitySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Resolves a slug produced by universitySlug() back to a name in `names`. */
export function universityFromSlug(slug: string, names: readonly string[]): string | null {
  const wanted = universitySlug(slug);
  return names.find((name) => universitySlug(name) === wanted) ?? null;
}
