import type { DeadlineNoticeDataset, DeadlineRecord, NoticeRecord, NoticeProgram, NoticeTrack, OfficialSource } from "./schema";

export interface NoticeMatchInput {
  program: NoticeProgram;
  track?: NoticeTrack;
  cycle?: string;
  now?: Date;
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

  return {
    upcoming: deadlines.filter((d) => !d.isPast),
    historical: deadlines.filter((d) => d.isPast),
    notices
  };
}

export function nextVerifiedDeadline(dataset: DeadlineNoticeDataset, input: NoticeMatchInput) {
  return matchDeadlineNoticeFeed(dataset, input).upcoming[0] ?? null;
}
