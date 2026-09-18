import "server-only";
import { runDiscovery } from "./discovery";
import { enqueuePendingNotices, type EnqueueResult } from "./review-queue";

/**
 * The scout run: one command that refreshes the official notice index and
 * then puts anything new in front of a reviewer.
 *
 * Two existing pieces, composed rather than rebuilt:
 *   1. runDiscovery()          -- fetches the Study in Korea board, stores
 *                                 official notices in public.notices
 *   2. enqueuePendingNotices() -- classifies what is stored and queues the
 *                                 unseen ones as pending_review
 *
 * Nothing this function does can publish. The furthest a notice travels
 * without a human is "pending_review".
 */

export interface ScoutResult {
  ranAt: string;
  /** Notices the crawler read from the official board this run. */
  listed: number;
  /** Notices newly written to the official index. */
  newlyDiscovered: number;
  /** Notices whose official content changed in place since last seen. */
  contentChanged: number;
  /** Indexed notices considered for queueing. */
  discovered: number;
  /** New pending_review items created. */
  queued: number;
  /** Already known -- queued before, or already reviewed. */
  skippedKnown: number;
  /** Notices that could not be normalized. One failure never ends the run. */
  parseFailures: { sourceUrl: string; reason: string }[];
  /** Non-fatal problems from either stage. */
  errors: string[];
}

/**
 * Runs discovery, then queueing.
 *
 * Discovery failing does not abort the run: the queue stage still works from
 * whatever is already in the index, so a network outage at the government
 * site degrades the run to "nothing new found" instead of losing it entirely.
 * The failure is reported, never swallowed.
 */
export async function runNoticeScout(options: { skipDiscovery?: boolean } = {}): Promise<ScoutResult> {
  const result: ScoutResult = {
    ranAt: new Date().toISOString(),
    listed: 0,
    newlyDiscovered: 0,
    contentChanged: 0,
    discovered: 0,
    queued: 0,
    skippedKnown: 0,
    parseFailures: [],
    errors: [],
  };

  if (!options.skipDiscovery) {
    try {
      for (const d of await runDiscovery()) {
        result.listed += d.listed;
        result.newlyDiscovered += d.inserted;
        result.contentChanged += d.updated;
        result.errors.push(...d.errors);
        for (const s of d.skipped) {
          result.parseFailures.push({ sourceUrl: s.sourceUrl, reason: s.reason });
        }
      }
    } catch (e) {
      result.errors.push(`discovery stage failed: ${(e as Error).message}`);
    }
  }

  try {
    const enqueued: EnqueueResult = await enqueuePendingNotices();
    result.discovered = enqueued.discovered;
    result.queued = enqueued.queued;
    result.skippedKnown = enqueued.skippedKnown;
    result.parseFailures.push(...enqueued.parseFailures);
    result.errors.push(...enqueued.errors);
  } catch (e) {
    result.errors.push(`queue stage failed: ${(e as Error).message}`);
  }

  return result;
}

/** One-line run summary for cron logs and the CLI. */
export function formatScoutSummary(r: ScoutResult): string {
  return [
    `listed ${r.listed}`,
    `newly discovered ${r.newlyDiscovered}`,
    `content changed ${r.contentChanged}`,
    `queued ${r.queued}`,
    `skipped known ${r.skippedKnown}`,
    `parse failures ${r.parseFailures.length}`,
    `errors ${r.errors.length}`,
  ].join(" · ");
}
