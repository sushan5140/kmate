/**
 * Calendar days in the admin's timezone, computed from UTC timestamps.
 *
 * Every timestamp in the database is UTC. Every "Today" the admin sees is a
 * calendar day in their own timezone. Those two are not the same thing, and
 * mixing them is how a dashboard ends up claiming eight replies went out
 * today when three of them landed yesterday evening local time.
 *
 * So: nothing is ever stored shifted. Days are derived here, and only here,
 * by converting a UTC instant to a wall-clock date in a named IANA zone. No
 * rows are copied per day and no daily rollover job exists -- a "day" is a
 * half-open [start, end) range of UTC instants, and every daily figure in the
 * feature is a query over one of those ranges.
 *
 * Pure module: no `server-only`, no database, no clock of its own beyond the
 * `now` a caller passes in, so the boundaries are directly testable.
 */

/**
 * Fallback when YOUTUBE_TIMEZONE is unset. KMate has no app-wide timezone
 * setting to inherit, and the admin running this workflow is in India.
 */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/** A calendar date with no time and no zone, as YYYY-MM-DD. */
export type DayString = string;

export function readTimezone(raw: string | undefined): string {
  const candidate = raw?.trim();
  if (!candidate) return DEFAULT_TIMEZONE;
  // A bad zone name must not take the dashboard down; fall back instead.
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

const partsFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/**
 * How far ahead of UTC `instant` is in `timeZone`, in milliseconds.
 *
 * Read off Intl rather than hardcoded, so this stays correct for a zone with
 * DST even though the default (Asia/Kolkata, permanent +05:30) has none.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Intl renders midnight as hour 24 in some engines; normalise it.
  const hour = get("hour") % 24;
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asIfUtc - instant.getTime();
}

/** The calendar date `instant` falls on, in `timeZone`. */
export function zonedDayString(instant: Date, timeZone: string): DayString {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** True for a well-formed YYYY-MM-DD that names a real calendar date. */
export function isDayString(value: unknown): value is DayString {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
  );
}

/**
 * The UTC instant at which `day` begins in `timeZone`.
 *
 * Solved by iteration rather than algebra: guess using the offset at UTC
 * midnight, then re-read the offset at the guess. One correction is enough
 * for every real zone, including the hour a DST transition moves.
 */
export function zonedDayStartUtc(day: DayString, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  let ts = naive - zoneOffsetMs(new Date(naive), timeZone);
  ts = naive - zoneOffsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

export interface DayRange {
  day: DayString;
  /** Inclusive UTC start. */
  startUtc: Date;
  /** EXCLUSIVE UTC end -- the next day's start. */
  endUtc: Date;
  timeZone: string;
}

/**
 * The half-open UTC range covering one local calendar day.
 *
 * Half-open on purpose: a timestamp exactly at midnight belongs to the day
 * beginning, not the day ending, so consecutive days partition time with no
 * gap and no row counted twice.
 */
export function dayRange(day: DayString, timeZone: string): DayRange {
  const startUtc = zonedDayStartUtc(day, timeZone);
  const endUtc = zonedDayStartUtc(addDays(day, 1), timeZone);
  return { day, startUtc, endUtc, timeZone };
}

/** Calendar arithmetic on the date itself, independent of any zone. */
export function addDays(day: DayString, delta: number): DayString {
  const [y, m, d] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + delta));
  return shifted.toISOString().slice(0, 10);
}

export function today(now: Date, timeZone: string): DayString {
  return zonedDayString(now, timeZone);
}

export function yesterday(now: Date, timeZone: string): DayString {
  return addDays(today(now, timeZone), -1);
}

/** The `count` most recent days, newest first, ending with `endDay`. */
export function recentDays(endDay: DayString, count: number): DayString[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => addDays(endDay, -i));
}

/** Which day scope the admin is looking at. */
export type DayScope = "today" | "yesterday" | "all" | DayString;

export function parseDayScope(raw: unknown): DayScope {
  if (raw === "yesterday" || raw === "all") return raw;
  if (isDayString(raw)) return raw;
  return "today";
}

/**
 * Resolves a scope to a concrete range, or null for "all time".
 *
 * Null is the honest representation of all-time -- it means "apply no date
 * filter", rather than inventing an arbitrary earliest date that would
 * silently drop older rows.
 */
export function resolveScope(scope: DayScope, now: Date, timeZone: string): DayRange | null {
  if (scope === "all") return null;
  if (scope === "today") return dayRange(today(now, timeZone), timeZone);
  if (scope === "yesterday") return dayRange(yesterday(now, timeZone), timeZone);
  return dayRange(scope, timeZone);
}

/**
 * Human-readable comment age: 12m, 2h, 1d, 3d.
 *
 * The exact timestamp is always kept in the row and shown on hover; this is
 * for scanning a list, where "3d" is read faster than a date.
 */
export function humanAge(from: string | null, now: Date): string {
  if (!from) return "—";
  const then = new Date(from).getTime();
  if (Number.isNaN(then)) return "—";

  const seconds = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d`;
  return `${Math.floor(days / 365)}y`;
}

/**
 * Whether a row still awaiting work first appeared before the day being
 * viewed -- the "Carried from Aug 29" indicator.
 *
 * Derived, deliberately. Marking rows as carried forward would mean a nightly
 * write over every pending row, which is a scheduled job this feature is not
 * allowed to have, and it would make the flag drift out of step with reality
 * the moment a row was decided. Deriving it from discovered_at means a row
 * appears in today's work view without being copied, moved, or rewritten:
 * one row, one history, shown wherever it is still relevant.
 */
export function carriedFromDay(
  discoveredAt: string | null,
  viewDay: DayString,
  timeZone: string
): DayString | null {
  if (!discoveredAt) return null;
  const origin = new Date(discoveredAt);
  if (Number.isNaN(origin.getTime())) return null;
  const originDay = zonedDayString(origin, timeZone);
  return originDay < viewDay ? originDay : null;
}

/**
 * An exact timestamp, rendered identically on the server and in the browser.
 *
 * `toLocaleString` without a `timeZone` resolves against whatever machine runs
 * it, so a server in UTC and a browser in IST produce different text for the
 * same instant -- and React treats that as a hydration mismatch (error #418),
 * which is exactly what the admin console was throwing.
 *
 * The zone is therefore pinned to a CONSTANT rather than to the configurable
 * outreachTimezone(). YOUTUBE_TIMEZONE is a server-only variable the client
 * cannot read, so deriving the display zone from it would reintroduce the very
 * mismatch this fixes. The trade-off is deliberate: these timestamps always
 * read in Asia/Kolkata even if the daily window were reconfigured, and the
 * zone is shown beside them in the UI.
 */
export function formatInstant(iso: string | null, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
}

/** "Aug 29" for a chip, from a plain day string, with no zone shifting. */
export function formatDayShort(day: DayString): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
