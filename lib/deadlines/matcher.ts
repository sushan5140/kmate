import type { DeadlineNoticeDataset, DeadlineRecord, NoticeRecord, NoticeProgram, NoticeTrack, OfficialSource } from "./schema";
import { mergeWithStatic, toDeadlineRecord, type LiveVerifiedDeadline, type StaticLiveConflict } from "./live-schema";

export interface NoticeMatchInput {
  program: NoticeProgram;
  track?: NoticeTrack;
  cycle?: string;
  now?: Date;
  /**
   * Verified deadlines from the database. Optional, and absent means the
   * behaviour is byte-for-byte what it was before live deadlines existed --
   * which is what keeps every existing caller and test valid.
   */
  live?: LiveVerifiedDeadline[];
}

export interface MatchedDeadline extends DeadlineRecord {
  source: OfficialSource;
  isPast: boolean;
  daysUntil: number;
}

export interface MatchedNotice extends NoticeRecord {
  source: OfficialSource;
}

const DAY_MS = 86_400_000;

export function matchDeadlineNoticeFeed(dataset: DeadlineNoticeDataset, input: NoticeMatchInput) {
  const now = input.now ?? new Date();
  const cycle = input.cycle ?? dataset.generated_for_cycle;
  const sources = new Map(dataset.sources.map((source) => [source.id, source]));

  const deadlines: MatchedDeadline[] = dataset.deadlines
    .filter((record) =>
      record.program === input.program &&
      record.cycle === cycle &&
      (record.track === null || !input.track || record.track === input.track)
    )
    .flatMap((record) => {
      const source = sources.get(record.source_id);
      if (!source) return [];
      const end = new Date(`${record.deadline}T23:59:59Z`);
      const daysUntil = Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
      return [{ ...record, source, isPast: daysUntil < 0, daysUntil }];
    })
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  const notices: MatchedNotice[] = dataset.notices
    .filter((record) =>
      record.program === input.program &&
      record.cycle === cycle &&
      (record.track === null || !input.track || record.track === input.track)
    )
    .flatMap((record) => {
      const source = sources.get(record.source_id);
      return source ? [{ ...record, source }] : [];
    })
    .sort((a, b) => b.published_at.localeCompare(a.published_at));

  // Live verified deadlines join the SAME upcoming/historical split, so a
  // date that came through the assistant ages exactly like a curated one.
  // The curated record wins any disagreement: a live row identical to one is
  // dropped as a duplicate, and one that contradicts a curated date is
  // dropped as a conflict and reported rather than shown beside it.
  const matchedLive = (input.live ?? []).filter(
    (d) =>
      d.program === input.program &&
      d.cycle === cycle &&
      (d.track === null || !input.track || d.track === input.track)
  );
  const merged = mergeWithStatic(matchedLive, deadlines);

  const liveDeadlines: MatchedDeadline[] = merged.live.map((d) => {
    const record = toDeadlineRecord(d);
    const end = new Date(`${record.deadline}T23:59:59Z`);
    const daysUntil = Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
    return { ...record, isPast: daysUntil < 0, daysUntil };
  });

  const all = [...deadlines, ...liveDeadlines].sort((a, b) => a.deadline.localeCompare(b.deadline));

  return {
    upcoming: all.filter((d) => !d.isPast),
    historical: all.filter((d) => d.isPast),
    notices,
    /** Live rows withheld because a curated record contradicts them. */
    conflicts: merged.conflicts as StaticLiveConflict[],
  };
}

export function nextVerifiedDeadline(dataset: DeadlineNoticeDataset, input: NoticeMatchInput) {
  return matchDeadlineNoticeFeed(dataset, input).upcoming[0] ?? null;
}
