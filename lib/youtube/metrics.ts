/**
 * The survival arithmetic, as a pure function.
 *
 * Separated from the queries that feed it so the rule can be tested directly,
 * because the rule is the part that was got wrong last time. A local bot
 * checked each reply five seconds after posting, counted every one as live,
 * and reported 100%. The real figure, once the exact reply ids were queried
 * days later, was nothing like it.
 *
 * Two refusals define this metric, and both are refusals to guess:
 *
 *   - an accepted reply is NOT a survivor. YouTube accepting a call says
 *     nothing about whether the reply is still there.
 *   - an accepted reply is NOT a casualty either. Unchecked is unknown, and
 *     inferring removal before the check would invent a failure exactly as
 *     the old bot invented a success.
 *
 * So unchecked replies leave the ratio entirely and are reported beside it.
 */

export interface SurvivalCounts {
  /** Checked after the window and found live. */
  live: number;
  /** Checked after the window and found gone. */
  removed: number;
  /** Sent, but not yet checked. Excluded from the ratio. */
  awaitingCheck: number;
}

export interface Survival {
  checked: number;
  live: number;
  awaitingCheck: number;
  /** live / checked, or null when nothing has been checked yet. */
  rate: number | null;
}

/**
 * Denominator: only replies actually CHECKED -- live plus removed.
 * Numerator: the live ones.
 *
 * A zero denominator yields null, never 0% and never 100%. "We have not
 * checked anything yet" and "everything we checked died" must not render the
 * same way.
 */
export function computeSurvival(counts: SurvivalCounts): Survival {
  const live = Math.max(0, counts.live);
  const removed = Math.max(0, counts.removed);
  const checked = live + removed;

  return {
    checked,
    live,
    awaitingCheck: Math.max(0, counts.awaitingCheck),
    rate: checked > 0 ? live / checked : null,
  };
}

/** "80%" / "—", for display. */
export function formatSurvivalRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}
