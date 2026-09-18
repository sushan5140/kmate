/**
 * Scholarship deadline lifecycle -- the single rule, in one place.
 *
 * This used to live only inside the freshness cron, which made page
 * visibility depend entirely on that job having run. It had not run in
 * fourteen days, and nothing surfaced that. A scholarship whose deadline had
 * passed would keep its stored `status = 'active'` and stay on the listing
 * indefinitely.
 *
 * So the rule is now a pure function, used twice:
 *   - the cron still writes it to the `status` column (cheap filtering, and
 *     an audit trail of when the transition happened)
 *   - the listing page applies it again at read time as a fallback
 *
 * Belt and braces on purpose. If the scheduler breaks again, a clearly
 * expired fixed-deadline scholarship still disappears from the active list.
 */

/** Days before a fixed deadline at which a scholarship becomes 'expiring_soon'. */
export const EXPIRING_SOON_DAYS = 7;

export type ScholarshipStatus = "active" | "expiring_soon" | "expired";

export interface LifecycleInput {
  deadline: string | null;
  deadline_type: string | null;
}

export interface LifecycleResult {
  status: ScholarshipStatus;
  isActive: boolean;
}

const dayString = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Where a scholarship sits in its lifecycle, as of `today`.
 *
 * Only a `fixed` type WITH a date can ever expire. Everything else --
 * admission_schedule, automatic, a null type, or a `fixed` type whose date is
 * missing -- stays active forever, because nothing in the source states an
 * end. Expiring an award whose closing date was never published would be
 * inventing the very fact the pipeline refuses to invent.
 *
 * Comparison is on UTC date strings, not timestamps: a deadline is a calendar
 * day, and lexicographic comparison of YYYY-MM-DD is exact for that. The
 * deadline day itself counts as still open.
 */
export function classifyScholarshipLifecycle(
  row: LifecycleInput,
  today: Date = new Date()
): LifecycleResult {
  if (row.deadline_type !== "fixed" || !row.deadline) {
    return { status: "active", isActive: true };
  }

  const todayStr = dayString(today);
  const soon = new Date(today);
  soon.setUTCDate(soon.getUTCDate() + EXPIRING_SOON_DAYS);
  const soonStr = dayString(soon);

  // Strictly before today -- the deadline day itself is still open.
  if (row.deadline < todayStr) return { status: "expired", isActive: false };
  if (row.deadline <= soonStr) return { status: "expiring_soon", isActive: true };
  return { status: "active", isActive: true };
}

/**
 * Read-time guard for the listing page.
 *
 * True when a row must not be shown as active regardless of what its stored
 * status says -- i.e. the stored value is stale because the cron has not run.
 */
export function isExpiredNow(row: LifecycleInput, today: Date = new Date()): boolean {
  return classifyScholarshipLifecycle(row, today).status === "expired";
}
