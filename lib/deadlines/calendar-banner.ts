import { getApplicationNotices } from "./index";
import type { LiveVerifiedDeadline } from "./live-schema";

export type CalendarSelection = { program: string; track: string; cycle: string | null };
export function calendarBanner(selection: CalendarSelection, live: LiveVerifiedDeadline[] = [], now?: Date) {
  const { program, track, cycle } = selection;
  if ((program !== "GKS-U" && program !== "GKS-G") || !cycle || !/^20\d{2}$/.test(cycle)) {
    return { title: "Choose your application cycle", detail: "Set your program and intake year to see relevant verified dates.", source: null };
  }
  if (track !== "embassy" && track !== "university") {
    return { title: "No upcoming verified deadline", detail: program + " " + cycle + " · Select Embassy or University Track in Application Readiness to check relevant dates.", source: null };
  }
  const feed = getApplicationNotices({ program, track, cycle, live, now });
  const next = feed.upcoming.find(d => d.status === "verified" && (d.scope === "application" || d.scope === "post_selection"));
  const context = program + " " + cycle + " · " + (track === "embassy" ? "Embassy Track" : "University Track");
  if (!next) {
    return { title: "No upcoming verified deadline", detail: context + ". Check official notices for your current round; institution-specific dates may differ.", source: null };
  }
  const date = new Date(next.deadline + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
  return { title: next.label + " · " + date, detail: context + ". Confirm applicability and exact cutoff with the official source.", source: next.source.url };
}
