import type { Track } from "@/lib/constants";

/**
 * Intake-year planning options, NOT a declaration that applications are open.
 * Exclude an intake only when the final-selection announcement is verified.
 * Unknown future cycles are never filtered by an estimated opening/closing date.
 * Sources: Study in Korea notices 4417 (U) and 4509 (G).
 */
const FINAL_SELECTION_PUBLISHED: Partial<Record<Track, Record<number, string>>> = {
  gks_u: { 2026: "2026-01-09" },
  gks_g: { 2026: "2026-07-01" },
};
export function validApplicationYears(track: Track, now = new Date()): number[] {
  const year = now.getUTCFullYear();
  const today = now.toISOString().slice(0, 10);
  return [year, year + 1, year + 2, year + 3].filter(candidate => {
    const published = FINAL_SELECTION_PUBLISHED[track]?.[candidate];
    return !published || today < published;
  });
}
/** A previously saved historical intake may be retained, not selected anew. */
export function profileApplicationYears(track: Track, savedYear: number | null, now = new Date()): number[] {
  const years = validApplicationYears(track, now);
  return Number.isInteger(savedYear) && savedYear !== null && savedYear >= 2000 && savedYear <= 2099
    ? [...new Set([savedYear, ...years])].sort((a, b) => a - b)
    : years;
}
