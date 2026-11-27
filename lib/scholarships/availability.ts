import { classifyScholarshipLifecycle, validScholarshipDate, type LifecycleInput } from "./lifecycle";

export const SOURCE_FRESH_DAYS = 14;
export const SOURCE_STALE_DAYS = 30;
export type SourceFreshness = { label: string; state: "fresh" | "aging" | "stale" | "unknown"; days: number | null };
export type ApplicationWindow = {
  opensAt: string;
  closesAt: string;
  kind: "admission" | "scholarship";
  /** A date-only closing statement cannot establish availability on that day. */
  cutoffKnown: boolean;
  intake: string;
  note: string;
};
export type AvailabilityInput = LifecycleInput & { status: string; is_active?: boolean; last_verified_at: string | null; application_window?: ApplicationWindow | null };
export type Availability = {
  kind: "archived" | "recheck" | "fixed" | "closing" | "automatic" | "admission" | "unknown" | "open" | "upcoming" | "cutoff";
  label: string;
  detail: string;
  freshness: SourceFreshness;
  listed: boolean;
  spotlight: boolean;
};
export function scholarshipSourceFreshness(checked: string | null, now = new Date()): SourceFreshness {
  const time = checked ? Date.parse(checked) : NaN;
  if (!Number.isFinite(time) || time > now.getTime()) return { label: "Verification not established", state: "unknown", days: null };
  const age = (now.getTime() - time) / 86_400_000;
  const days = Math.floor(age);
  if (age <= SOURCE_FRESH_DAYS) return { label: "Recently checked", state: "fresh", days };
  if (age <= SOURCE_STALE_DAYS) return { label: "Recheck source", state: "aging", days };
  return { label: "Stale source check", state: "stale", days };
}
export function scholarshipAvailability(row: AvailabilityInput, now = new Date()): Availability {
  const freshness = scholarshipSourceFreshness(row.last_verified_at, now);
  const result = (kind: Availability["kind"], label: string, detail: string, listed = true): Availability => ({
    kind, label, detail, freshness, listed, spotlight: listed && freshness.state === "fresh" && (!row.application_window || kind === "open"),
  });
  const fixed = row.deadline_type === "fixed" && validScholarshipDate(row.deadline);
  const lifecycle = classifyScholarshipLifecycle(row, now);
  if (row.is_active === false || row.status === "expired" || (fixed && lifecycle.status === "expired"))
    return result("archived", "Archived / unavailable", "Historical reference only; verify a new intake separately.", false);
  const window = row.application_window;
  if (window) {
    const start = Date.parse(window.opensAt);
    const end = Date.parse(window.closesAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
      return result("recheck", "Window not verified", "The source window is incomplete.");
    // Check exact KST cutoff even if the crawler's stored status is stale.
    if (now.getTime() >= end)
      return result("archived", "Application window ended", window.note, false);
    if (freshness.state !== "fresh")
      return result("recheck", "Availability unverified", "The published window needs a fresh source check. " + window.note);
    if (now.getTime() < start)
      return result("upcoming", "Upcoming published window", window.note);
    if (!window.cutoffKnown && now.getTime() >= end - 86_400_000)
      return result("cutoff", "Closing day · verify exact cutoff", window.note);
    return result("open", window.kind === "admission" ? "Admission window open" : "Scholarship window open", window.note + " Based on the published schedule; verify the live application portal.");
  }
  if (freshness.state !== "fresh")
    return result("recheck", "Availability unverified", "Source check is not recent. Verify the relevant intake and application window before acting.");
  if (fixed)
    return result(lifecycle.status === "expiring_soon" ? "closing" : "fixed", lifecycle.status === "expiring_soon" ? "Published date approaching" : "Published closing date", "A closing date alone does not confirm that applications have opened. Check intake and exact cutoff.");
  if (row.deadline_type === "automatic")
    return result("automatic", "Automatic consideration", "Admission and award conditions still apply; no separate scholarship window is confirmed.");
  if (row.deadline_type === "admission_schedule")
    return result("admission", "Admission-dependent", "Verify the institution's intake-specific admissions schedule.");
  return result("unknown", "Deadline not confirmed", "No complete fixed deadline is recorded. Current application availability is unknown.");
}
export function scholarshipDeadlineLabel(row: LifecycleInput): string {
  if (row.deadline_type === "fixed" && validScholarshipDate(row.deadline)) {
    return new Date(row.deadline + "T00:00:00Z").toLocaleDateString("en-US", {year:"numeric",month:"long",day:"numeric",timeZone:"UTC"});
  }
  if (row.deadline_type === "automatic") return "Automatic consideration — check admission conditions";
  if (row.deadline_type === "admission_schedule") return "Follows the admission schedule — verify intake";
  return "Not confirmed in the indexed source";
}
