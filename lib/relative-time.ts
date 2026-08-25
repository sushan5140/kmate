const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact relative timestamp -- "just now", "4m ago", "2h ago", "3d ago",
 * falling back to an absolute date past a month, where "37d ago" stops being
 * easier to read than the date itself.
 *
 * Only safe to call from client components: the output depends on the current
 * clock, so rendering it during SSR and again on hydration can disagree.
 */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diff = Date.now() - then;
  // Small negatives happen routinely from clock skew between the user's
  // machine and the database's now() -- reading "in 2 seconds" on a reply you
  // just posted looks broken, so treat the near future as now.
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`;

  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
