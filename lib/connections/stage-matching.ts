export const MATCH_STAGES = [
  { value: "preparing", label: "Preparing documents" },
  { value: "submitted", label: "Submitted application" },
  { value: "interview", label: "Interview preparation / interview stage" },
  { value: "awaiting_result", label: "Awaiting a result" },
] as const;
export type MatchStage = typeof MATCH_STAGES[number]["value"];
export function isMatchStage(value: unknown): value is MatchStage {
  return MATCH_STAGES.some(stage => stage.value === value);
}
export function isChoiceId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function isMatchCycle(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 2000 && value <= 2099;
}
export type MatchChoice = { id: string; name: string };
export type MatchPreference = { choice_id: string; stage: MatchStage; expires_at: string; consented_at: string };
export function matchPreferenceActive(pref: MatchPreference | null, choices: MatchChoice[], now: number): boolean {
  return !!pref && isMatchStage(pref.stage) && choices.some(choice => choice.id === pref.choice_id) && Date.parse(pref.expires_at) > now;
}
