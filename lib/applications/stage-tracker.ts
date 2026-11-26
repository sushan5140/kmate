import type { SavedApplication } from "./schema";

export const STAGE_STATUSES = [
  "not_started", "preparing", "submitted", "receipt_confirmed", "interview_scheduled",
  "interview_completed", "awaiting_result", "selected", "not_selected", "withdrawn",
] as const;
export type StageStatus = typeof STAGE_STATUSES[number];
export const STAGE_LABELS: Record<StageStatus, string> = {
  not_started: "Not started", preparing: "Preparing", submitted: "Submitted",
  receipt_confirmed: "Receipt confirmed", interview_scheduled: "Interview scheduled",
  interview_completed: "Interview completed", awaiting_result: "Awaiting result",
  selected: "Selected", not_selected: "Not selected", withdrawn: "Withdrawn",
};
export type StageTarget = { id: string; label: string; kind: "first_round" | "university_review" | "overall" };
export type StageEntry = { scope: string; targetId: string; status: StageStatus; eventDate: string; nextCheck: string };
export const MAX_STAGE_ENTRIES = 300;
export const EMPTY_STAGE = { status: "not_started", eventDate: "", nextCheck: "" } as const;

export function validStageCycle(cycle: string): boolean {
  return /^20\d{2}$/.test(cycle);
}
export function validStageDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function stageTargets(app: SavedApplication): StageTarget[] {
  const universities: StageTarget[] = app.universities.map(u => ({
    id: "university:" + JSON.stringify([u.id, u.name, u.major ?? ""]),
    label: u.name + (u.major ? " · " + u.major : ""),
    kind: app.track === "embassy" ? "university_review" : "first_round",
  }));
  return [
    ...(app.track === "embassy" ? [{ id: "embassy", label: "Embassy / first-round institution", kind: "first_round" as const }] : []),
    ...universities,
    { id: "overall", label: "NIIED / overall selection", kind: "overall" },
  ];
}
/** Old configurations must never inherit an outcome after changing route, cycle, university or major. */
export function stageScope(app: SavedApplication, cycle: string): string | null {
  if (!validStageCycle(cycle) || app.status !== "active") return null;
  return JSON.stringify([app.id, app.program, app.track, app.subtype ?? "", cycle,
    app.universities.map(u => [u.id, u.name, u.major ?? ""]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
}
export function stageStatusesFor(target: StageTarget): readonly StageStatus[] {
  return target.kind === "overall"
    ? ["not_started", "awaiting_result", "selected", "not_selected", "withdrawn"]
    : STAGE_STATUSES;
}
function validStatus(value: unknown): value is StageStatus {
  return STAGE_STATUSES.some(status => status === value);
}
export function validStageEntry(value: unknown): value is StageEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<StageEntry>;
  return typeof v.scope === "string" && v.scope.length > 0 && v.scope.length <= 6000 &&
    typeof v.targetId === "string" && v.targetId.length > 0 && v.targetId.length <= 1000 &&
    validStatus(v.status) && typeof v.eventDate === "string" && (!v.eventDate || validStageDate(v.eventDate)) &&
    typeof v.nextCheck === "string" && (!v.nextCheck || validStageDate(v.nextCheck));
}
export function parseStageEntries(raw: string | null): StageEntry[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const result: StageEntry[] = [];
    for (const item of value) {
      if (!validStageEntry(item)) continue;
      const key = JSON.stringify([item.scope, item.targetId]);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ scope: item.scope, targetId: item.targetId, status: item.status, eventDate: item.eventDate, nextCheck: item.nextCheck });
      if (result.length >= MAX_STAGE_ENTRIES) break;
    }
    return result;
  } catch {
    return [];
  }
}
export function stageEntryFor(entries: StageEntry[], scope: string, target: StageTarget): StageEntry | undefined {
  return entries.find(entry => entry.scope === scope && entry.targetId === target.id && stageStatusesFor(target).includes(entry.status));
}
export function upsertStageEntry(entries: StageEntry[], entry: StageEntry): StageEntry[] | null {
  if (!validStageEntry(entry)) return null;
  const existing = entries.some(item => item.scope === entry.scope && item.targetId === entry.targetId);
  if (!existing && entries.length >= MAX_STAGE_ENTRIES) return null;
  return existing ? entries.map(item => item.scope === entry.scope && item.targetId === entry.targetId ? entry : item) : [...entries, entry];
}
export function clearStageScope(entries: StageEntry[], scope: string): StageEntry[] {
  return entries.filter(entry => entry.scope !== scope);
}
