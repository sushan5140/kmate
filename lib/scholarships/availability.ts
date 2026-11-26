import { classifyScholarshipLifecycle, type LifecycleInput } from "./lifecycle";

export const SOURCE_FRESH_DAYS = 14;
export const SOURCE_STALE_DAYS = 30;
export type SourceFreshness = { label: string; state: "fresh" | "aging" | "stale" | "unknown"; days: number | null };
export type AvailabilityInput = LifecycleInput & { status: string; is_active?: boolean; last_verified_at: string | null };
export type Availability = {
  kind: "archived" | "recheck" | "fixed" | "closing" | "automatic" | "admission" | "unknown";
  label: string;
  detail: string;
  freshness: SourceFreshness;
  listed: boolean;
  spotlight: boolean;
};
export function scholarshipSourceFreshness(checked: string | null, now = new Date()): SourceFreshness {
  const time = checked ? Date.parse(checked) : NaN;
  if (!Number.isFinite(time) || time > now.getTime()) return { label: "Verification not established", state: "unknown", days: null };
  const days = Math.floor((now.getTime() - time) / 86_400_000);
  if (days <= SOURCE_FRESH_DAYS) return { label: "Recently checked", state: "fresh", days };
  if (days <= SOURCE_STALE_DAYS) return { label: "Recheck source", state: "aging", days };
  return { label: "Stale source check", state: "stale", days };
}
export function validScholarshipDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function scholarshipAvailability(row: AvailabilityInput, now = new Date()): Availability {
  const freshness = scholarshipSourceFreshness(row.last_verified_at, now);
  const result = (kind: Availability["kind"], label: string, detail: string, listed = true): Availability => ({
    kind, label, detail, freshness, listed, spotlight: listed && freshness.state === "fresh",
  });
  const fixed = row.deadline_type === "fixed" && validScholarshipDate(row.deadline);
  const lifecycle = classifyScholarshipLifecycle(row, now);
  if (row.is_active === false || row.status === "expired" || (fixed && lifecycle.status === "expired"))
    return result("archived", "Archived / unavailable", "Historical reference only; verify a new intake separately.", false);
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
