import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Automation health -- deliberately small.
 *
 * The audit found last_checked_at / last_successful_at were written and then
 * never read by anything: three sources had been failing for a fortnight and
 * nowhere in the product said so. This is the read side, not a monitoring
 * system -- enough for an admin to see that a source has gone quiet or a
 * scheduled job has stopped firing.
 *
 * Source freshness alone cannot distinguish "the job ran and found nothing"
 * from "the job never ran", which is why automation_runs exists beside it.
 */

/** A source unseen for longer than this is treated as stale. */
export const SOURCE_STALE_HOURS = 48;
/** A job with no run in this long is treated as not firing. */
export const JOB_STALE_HOURS = 36;

/**
 * Four distinct states, because "not healthy" hides the difference that
 * matters most when deciding what to do about it.
 *
 *   healthy    succeeded recently
 *   failing    has a recorded error or repeated failures -- act now
 *   stale      last success is older than the window, with no error recorded
 *   never_run  no success ever recorded -- usually a scheduler that never fired
 *
 * A run that succeeded but found zero items is HEALTHY. Finding nothing is a
 * normal outcome for a board with no new notices, and treating it as a failure
 * would make the whole signal useless.
 */
export type HealthState = "healthy" | "stale" | "failing" | "never_run";

export interface SourceHealth {
  id: string;
  name: string;
  active: boolean;
  lastCheckedAt: string | null;
  lastSuccessfulAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  stale: boolean;
  staleSince: string | null;
  hoursSinceSuccess: number | null;
  state: HealthState;
}

export interface JobHealth {
  job: string;
  lastRunAt: string | null;
  lastOk: boolean | null;
  lastError: string | null;
  stale: boolean;
  hoursSinceRun: number | null;
  state: HealthState;
}

const hoursSince = (iso: string | null, now: Date): number | null =>
  iso ? (now.getTime() - new Date(iso).getTime()) / 3_600_000 : null;

export async function getSourceHealth(now: Date = new Date()): Promise<SourceHealth[]> {
  const { data } = await getSupabaseAdmin()
    .from("sources")
    .select("id, name, active, last_checked_at, last_successful_at, last_error, consecutive_failures")
    .order("active", { ascending: false });

  return (data ?? []).map((s) => {
    const h = hoursSince(s.last_successful_at, now);
    // An inactive source is not stale -- nothing is asking it to run.
    const stale = s.active && (h === null || h > SOURCE_STALE_HOURS);
    const failures = s.consecutive_failures ?? 0;
    const state: HealthState = !s.active
      ? "healthy"
      : s.last_successful_at === null
        ? "never_run"
        : failures > 0 || s.last_error
          ? "failing"
          : stale
            ? "stale"
            : "healthy";

    return {
      id: s.id,
      name: s.name,
      active: s.active,
      lastCheckedAt: s.last_checked_at,
      lastSuccessfulAt: s.last_successful_at,
      lastError: s.last_error ?? null,
      consecutiveFailures: failures,
      stale,
      staleSince: stale ? s.last_successful_at : null,
      hoursSinceSuccess: h === null ? null : Math.round(h),
      state,
    };
  });
}

/** The jobs expected to run on a schedule, and whether they actually are. */
export const SCHEDULED_JOBS = [
  "notice-scout",
  "scholarships",
  "scholarships-freshness",
  "deadline-assistant",
] as const;

export async function getJobHealth(now: Date = new Date()): Promise<JobHealth[]> {
  const admin = getSupabaseAdmin();
  const out: JobHealth[] = [];
  for (const job of SCHEDULED_JOBS) {
    const { data } = await admin
      .from("automation_runs")
      .select("started_at, ok, error")
      .eq("job", job)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const h = hoursSince(data?.started_at ?? null, now);
    const stale = h === null || h > JOB_STALE_HOURS;
    // A job that ran and simply found nothing is healthy: zero items is a
    // normal day, not a failure.
    const state: HealthState =
      data?.started_at == null ? "never_run" : data.ok === false ? "failing" : stale ? "stale" : "healthy";

    out.push({
      job,
      lastRunAt: data?.started_at ?? null,
      lastOk: data?.ok ?? null,
      lastError: data?.error ?? null,
      // Never having run at all is the loudest possible staleness.
      stale,
      hoursSinceRun: h === null ? null : Math.round(h),
      state,
    });
  }
  return out;
}

/**
 * Wraps a job so every run is recorded whatever happens to it.
 *
 * The write-after-catch is the point: a job that throws still leaves a row
 * saying it ran and failed, which is the difference between a visible
 * breakage and a silent one.
 */
export async function recordRun<T extends object>(
  job: string,
  trigger: "cron" | "manual",
  fn: () => Promise<T>
): Promise<{ result: T | null; error: string | null }> {
  const admin = getSupabaseAdmin();
  const startedAt = new Date().toISOString();
  let result: T | null = null;
  let error: string | null = null;

  try {
    result = await fn();
  } catch (e) {
    error = (e as Error).message;
  }

  const { error: writeError } = await admin.from("automation_runs").insert({
    job,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ok: error === null,
    stats: (result ?? {}) as Record<string, unknown>,
    error,
    trigger,
  });
  if (writeError) console.error("[automation] could not record run for", job, writeError.message);

  return { result, error };
}
