import { normalizeIntake, profileIntake } from "@/lib/gks/guideline-editions";
import { profileApplicationYears } from "@/lib/deadline";

export function resolveReadinessIntake(explicit: unknown, program: string, profileProgram: string, profileYear: unknown): string | null {
  if (program !== "GKS-U" && program !== "GKS-G") return null;
  return explicit === undefined || explicit === null
    ? profileIntake(program, profileProgram, profileYear)
    : normalizeIntake(explicit);
}
export function readinessYearOptions(program: string, profileProgram: string, profileYear: unknown, selected: string | null, now = new Date()): string[] {
  if (program !== "GKS-U" && program !== "GKS-G") return [];
  const saved = profileIntake(program, profileProgram, profileYear);
  return [...new Set([...profileApplicationYears(program === "GKS-U" ? "gks_u" : "gks_g", saved ? Number(saved) : null, now).map(String), ...(selected ? [selected] : [])])].sort();
}
export function canSetProfileIntake(program: string, track: unknown, year: unknown, savedYear: number | null, now = new Date()): boolean {
  if (track !== "gks_u" && track !== "gks_g") return false;
  return program === (track === "gks_u" ? "GKS-U" : "GKS-G") && typeof year === "number" &&
    Number.isInteger(year) && profileApplicationYears(track, savedYear, now).includes(year);
}
