/** Edition metadata, not live application availability. Update only after official review. */
export const GUIDELINE_EDITIONS = {
  "GKS-U": { cycle: "2027", notice: "https://www.studyinkorea.go.kr/ko/notice/scholarshipsRead.do?bbsId=BBSMSTR_000000000461&nttId=4522" },
  "GKS-G": { cycle: "2026", notice: "https://studyinkorea.go.kr/ko/plan/gksNoticeRead.do?bbsId=BBSMSTR_000000000461&nttId=4420" },
} as const;
export const OFFICIAL_NOTICE_BOARD = "https://www.studyinkorea.go.kr/ko/notice/scholarshipsList.do?boardSort=3";
export type GuidelineProgram = keyof typeof GUIDELINE_EDITIONS;
export function normalizeIntake(value: unknown): string | null {
  const year = typeof value === "number" && Number.isInteger(value) ? String(value) : value;
  return typeof year === "string" && /^20\d{2}$/.test(year) ? year : null;
}
export function profileIntake(program: string, profileProgram: string, year: unknown): string | null {
  return program === profileProgram ? normalizeIntake(year) : null;
}
export function editionMatches(program: GuidelineProgram, target: string | null): boolean {
  return target !== null && target === GUIDELINE_EDITIONS[program].cycle;
}
export function editionNotice(program: GuidelineProgram, target: string | null): string {
  const source = GUIDELINE_EDITIONS[program].cycle;
  return editionMatches(program, target)
    ? "Reference edition: " + program + " " + source + ". Matching the intake does not confirm applications are open or that an individual institution's instructions are unchanged."
    : "Reference only: " + program + " " + source + " materials. " + (target ? "Your intended intake is " + target + "." : "Your intended intake is not established for this program.") + " Do not use these as confirmed requirements, deadlines or eligibility for a different cycle.";
}
/** Only a year attached to a GKS/cycle/intake label overrides the profile. A graduation year is not an intake. */
export function explicitQuestionIntake(question: string): string | null | "ambiguous" {
  const years = new Set<string>();
  const patterns = [/\b(20\d{2})\s+(?:GKS(?:-[UG])?|cycle|intake|application|scholarship)\b/gi, /\b(?:GKS(?:-[UG])?|cycle|intake|application|scholarship)\s*[:\-]?\s*(20\d{2})\b/gi];
  for (const pattern of patterns) for (const match of question.matchAll(pattern)) years.add(match[1]);
  return years.size > 1 ? "ambiguous" : [...years][0] ?? null;
}
export function assistantIntake(question: string, selected: GuidelineProgram, storedProgram: string, storedYear: unknown) {
  const namedU = /\bGKS[- ]U\b/i.test(question);
  const namedG = /\bGKS[- ]G\b/i.test(question);
  if ((namedU && selected !== "GKS-U") || (namedG && selected !== "GKS-G")) return null;
  const explicit = explicitQuestionIntake(question);
  if (explicit === "ambiguous") return null;
  return explicit ?? profileIntake(selected, storedProgram, storedYear);
}
export function evidenceForIntake<T extends { cycle?: string | null; program?: string | null }>(evidence: T[], cycle: string, program: "UG" | "G"): T[] {
  return evidence.filter(item => item.cycle === cycle && item.program === program);
}
