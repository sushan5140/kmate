"use client";

import { useEffect, useState } from "react";

/**
 * The current UTC date as "YYYY-MM-DD", refreshed exactly when it changes.
 *
 * The deadline feed derives upcoming-vs-historical from `new Date()` inside a
 * useMemo keyed on `[program, track, cycle]`. None of those change as time
 * passes, so a tab left open across a deadline boundary kept showing a
 * deadline as upcoming -- "due today" indefinitely -- until something
 * unrelated forced a re-render.
 *
 * Using this value as an additional memo key fixes that. It deliberately is
 * NOT a polling interval: one timer is scheduled for the next UTC midnight,
 * it fires once, state changes, and the next timer is scheduled. A tab open
 * for a week schedules seven timers and re-renders seven times, rather than
 * re-rendering every few seconds to notice a change that happens daily.
 *
 * UTC is the right unit because the matcher compares against a deadline
 * pinned to 23:59:59Z; using local midnight would refresh at a moment that
 * does not correspond to any boundary the matcher cares about.
 */

export const utcDateKey = (d: Date = new Date()) => d.toISOString().slice(0, 10);

/** Milliseconds from `now` until the next UTC midnight, always >= 1. */
export function msUntilNextUtcMidnight(now: Date = new Date()): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  );
  return Math.max(1, next - now.getTime());
}

export function useUtcDateKey(): string {
  // Server render and first client render must agree, so the initial value is
  // computed the same way in both; the timer only ever runs on the client.
  const [key, setKey] = useState(utcDateKey);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timer = setTimeout(() => {
        setKey(utcDateKey());
        // Re-arm from the new "now" rather than assuming a fixed 24h, so a
        // suspended/resumed laptop or a clock change cannot drift the wake-up.
        schedule();
      }, msUntilNextUtcMidnight());
    };

    // A tab that was asleep across midnight wakes with a stale key; catching
    // up on visibility change costs nothing and covers the common laptop-lid
    // case, which the timer alone can miss when the OS suspends timers.
    const onVisible = () => {
      if (document.visibilityState === "visible") setKey(utcDateKey());
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return key;
}
