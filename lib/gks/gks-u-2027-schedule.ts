import { GKS_U_2027_POLICY } from "./gks-u-2027-policy";

export type GksUPlanningRoute = "general" | "r_gks" | "university" | null;
export function resolvePlanningRoute(track: string, subtype: string): GksUPlanningRoute {
  if (track === "university") return "university";
  if (track === "embassy" && (subtype === "general" || subtype === "r_gks")) return subtype;
  return null;
}

/** Published schedule, not live portal status or a personal selection result. */
export function gksU2027Schedule(route: GksUPlanningRoute, day: string) {
  const policy = GKS_U_2027_POLICY;
  if (!route) return { label: "Choose your application route", next: "Select a route before using route-specific guidance.", deadline: "Depends on selected route" };
  if (route === "university") {
    const label = day < "2026-09-01" ? "Before published application window"
      : day <= "2026-11-30" ? "Published university application period"
      : day <= policy.timeline.finalResultExpected ? "Published selection period"
      : "Published schedule elapsed";
    return { label, next: "Check the chosen university's own notice and the Study in Korea board. Exact deadlines, interview dates and outcomes are not inferred from the national window.", deadline: "University-specific · verify with institution" };
  }
  const start = policy.embassyApplication.opensAtUtc.slice(0, 10);
  const end = policy.embassyApplication.closesAtUtc.slice(0, 10);
  const deadline = "Sep 30, 2026 · 18:00 KST" + (day > end ? " · passed" : day === end ? " · check cutoff" : "");
  if (day < start) return { label: "Before scheduled opening", next: "Verify the published application window and prepare documents.", deadline };
  if (day === start) return { label: "Scheduled opening day", next: "Check the portal and the exact opening time (11:00 KST).", deadline };
  if (day < end) return { label: "Published Embassy application window", next: "Verify the portal status and recipient instructions.", deadline };
  if (day === end) return { label: "Scheduled closing day", next: "Check the portal and exact cutoff (18:00 KST); do not assume it is still open.", deadline };
  if (day <= policy.timeline.embassyRound1ResultBy) return { label: "Scheduled Embassy first-round selection", next: "Monitor your embassy's official results; no personal result is inferred.", deadline };
  if (day <= policy.timeline.universityRound3By) return { label: "Scheduled NIIED / university selection period", next: "Check your actual round outcome and current official notices. Follow only the instructions that apply to your result.", deadline };
  if (day <= policy.timeline.finalResultExpected) return { label: "Scheduled final selection period", next: "Check the official notices for remaining steps and confirmed results.", deadline };
  return { label: "Published schedule elapsed", next: "Check official announcements for final results or revisions. The scheduled date alone does not establish that selection is complete.", deadline };
}
