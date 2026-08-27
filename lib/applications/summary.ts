import type { ApplicationDashboardSummary, SavedApplication } from "./schema";

export type ProgressState = "ready" | "in_progress" | "missing" | "not_applicable" | "untracked";
export interface DashboardReadinessItem { status: "required" | "conditional" | "optional" | "not_stated"; progress: ProgressState; }
export interface DashboardReadinessSnapshot {
  common: DashboardReadinessItem[];
  universities: Array<{ name: string; major?: string; items: DashboardReadinessItem[] }>;
}

function summarize(items: DashboardReadinessItem[]) {
  const required = items.filter(i => i.status === "required");
  const requiredReady = required.filter(i => i.progress === "ready").length;
  const requiredMissing = required.filter(i => i.progress === "missing").length;
  const requiredUntracked = required.filter(i => i.progress === "untracked" || i.progress === "in_progress").length;
  return {
    requiredTotal: required.length,
    requiredReady,
    requiredMissing,
    requiredUntracked,
    conditionalTotal: items.filter(i => i.status === "conditional").length,
    optionalTotal: items.filter(i => i.status === "optional").length,
    progressPercent: required.length ? Math.round((requiredReady / required.length) * 100) : null
  };
}

export function buildApplicationDashboardSummary(application: SavedApplication, readiness: DashboardReadinessSnapshot): ApplicationDashboardSummary {
  const common = summarize(readiness.common);
  const universities = application.universities.map(choice => {
    const snapshot = readiness.universities.find(u => u.name === choice.name);
    return {
      id: choice.id, name: choice.name, major: snapshot?.major ?? choice.major, priority: choice.priority,
      ...summarize(snapshot?.items ?? [])
    };
  });
  const overall = summarize([...readiness.common, ...readiness.universities.flatMap(u => u.items)]);
  return {
    applicationId: application.id, program: application.program, track: application.track, subtype: application.subtype,
    overall,
    common: {
      requiredTotal: common.requiredTotal, requiredReady: common.requiredReady,
      requiredMissing: common.requiredMissing, requiredUntracked: common.requiredUntracked,
      progressPercent: common.progressPercent
    },
    universities
  };
}
