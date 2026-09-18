import type { DeadlineRecord, NoticeProgram, NoticeTrack, OfficialSource } from "./schema";

/**
 * Live verified deadlines, and how they merge with the curated dataset.
 *
 * Pure functions only -- the client feed runs these, so nothing here touches
 * a database. The server loads rows (lib/deadlines/live.ts) and hands them in.
 *
 * The merge rule, in one sentence: the curated record always wins, and a live
 * record that disagrees with one is dropped rather than shown alongside it.
 * Two contradictory dates for the same deadline is the single worst thing
 * this feature could put in front of an applicant, so the ambiguity is
 * resolved toward the record a human wrote by hand, and the disagreement is
 * reported separately for an admin to settle.
 */

export interface LiveVerifiedDeadline {
  id: string;
  program: NoticeProgram;
  track: NoticeTrack | null;
  cycle: string;
  deadlineType: string;
  label: string;
  deadline: string;
  timezone: string | null;
  scopeType: "global" | "country" | "university";
  country: string | null;
  university: string | null;
  sourceUrl: string;
  sourceNoticeId: string | null;
  confidence: number | null;
  verificationSource: "assistant" | "admin";
}

/**
 * Types that belong on an applicant's deadline countdown.
 *
 * An interview or a result date is a real, correctly-typed schedule fact, and
 * it is kept in the database -- but it is not a thing you must DO by a date,
 * so it never appears as a deadline to meet. Keeping the list explicit means
 * adding a new type does not silently opt it into the countdown.
 */
export const COUNTDOWN_DEADLINE_TYPES = ["application_deadline", "document_deadline"] as const;

export function isCountdownType(t: string): boolean {
  return (COUNTDOWN_DEADLINE_TYPES as readonly string[]).includes(t);
}

/**
 * Whether a live row may take part in applicant matching at all.
 *
 * Only global scope. There is no trusted signal for an applicant's country or
 * university anywhere in the product, so a country-scoped deadline matched on
 * programme and track alone would be shown to every applicant worldwide --
 * a Nepal embassy date presented to someone applying from Brazil. The
 * metadata is stored and visible to admins; it is simply not matched on.
 */
export function participatesInMatching(d: LiveVerifiedDeadline): boolean {
  return d.scopeType === "global" && isCountdownType(d.deadlineType);
}

/** Identity of a deadline for dedupe. Scope is part of it, deliberately. */
export function deadlineIdentity(d: {
  program: string;
  cycle: string;
  track: string | null;
  deadlineType?: string;
  scope?: string;
  deadline: string;
}): string {
  return [
    d.program,
    d.cycle,
    d.track ?? "",
    d.deadlineType ?? "",
    d.scope ?? "global",
    d.deadline,
  ]
    .map((v) => String(v).trim().toLowerCase())
    .join("|");
}

/** Same deadline ignoring the DATE -- i.e. the slot a date competes for. */
function slotIdentity(d: {
  program: string;
  cycle: string;
  track: string | null;
  deadlineType?: string;
  scope?: string;
}): string {
  return [d.program, d.cycle, d.track ?? "", d.deadlineType ?? "", d.scope ?? "global"]
    .map((v) => String(v).trim().toLowerCase())
    .join("|");
}

/**
 * The curated dataset describes a date by `scope`; the live table uses
 * `deadline_type`. This is the correspondence, so the two can be compared
 * without either side having to know the other's vocabulary.
 */
const STATIC_SCOPE_TO_TYPE: Record<string, string> = {
  application: "application_deadline",
  post_selection: "document_deadline",
  result: "result",
  other: "other",
};

export interface StaticLiveConflict {
  liveId: string;
  staticDeadline: string;
  liveDeadline: string;
  slot: string;
}

export interface MergeResult {
  /** Live rows safe to show alongside the curated ones. */
  live: LiveVerifiedDeadline[];
  /** Live rows dropped because a curated record already covers them. */
  duplicates: string[];
  /** Live rows dropped because they CONTRADICT a curated record. */
  conflicts: StaticLiveConflict[];
}

/**
 * Filters live deadlines against the curated records for the same applicant.
 *
 * Three outcomes per live row:
 *   - identical to a curated record  -> dropped as a duplicate (no change)
 *   - same slot, different date      -> dropped as a CONFLICT and reported
 *   - nothing comparable             -> kept
 *
 * `staticRecords` should already be narrowed to the applicant's programme,
 * cycle and track; this function does not re-apply that filter, it only
 * reconciles.
 */
export function mergeWithStatic(
  live: LiveVerifiedDeadline[],
  staticRecords: DeadlineRecord[]
): MergeResult {
  const staticByIdentity = new Set<string>();
  const staticBySlot = new Map<string, string>();

  for (const s of staticRecords) {
    // A curated record's own `scope` field says what kind of date it is.
    // Treating every one as an application deadline collapsed them all into a
    // single slot, so ANY live deadline for the same programme/cycle/track
    // looked like a contradiction of them -- the curated 2026 GKS-U records
    // are all post_selection document dates, and a genuine application
    // deadline was being dropped as a conflict with them.
    const idBase = {
      program: s.program,
      cycle: s.cycle,
      track: s.track,
      deadlineType: STATIC_SCOPE_TO_TYPE[s.scope] ?? "other",
      scope: "global",
      deadline: s.deadline,
    };
    staticByIdentity.add(deadlineIdentity(idBase));
    staticBySlot.set(slotIdentity(idBase), s.deadline);
  }

  const out: MergeResult = { live: [], duplicates: [], conflicts: [] };

  for (const d of live) {
    if (!participatesInMatching(d)) continue;

    const base = {
      program: d.program,
      cycle: d.cycle,
      track: d.track,
      deadlineType: d.deadlineType,
      scope: d.scopeType,
      deadline: d.deadline,
    };

    if (staticByIdentity.has(deadlineIdentity(base))) {
      out.duplicates.push(d.id);
      continue;
    }
    const rival = staticBySlot.get(slotIdentity(base));
    if (rival && rival !== d.deadline) {
      out.conflicts.push({
        liveId: d.id,
        staticDeadline: rival,
        liveDeadline: d.deadline,
        slot: slotIdentity(base),
      });
      continue;
    }
    out.live.push(d);
  }

  return out;
}

export interface ReportedConflict {
  liveId: string;
  program: string;
  track: string | null;
  cycle: string;
  deadlineType: string;
  staticDate: string;
  liveDate: string;
  sourceUrl: string;
  reason: string;
}

/**
 * Every static-vs-live disagreement across the whole dataset, for the admin
 * to settle.
 *
 * The applicant-facing merge already withholds these -- a contradicted live
 * date is never shown -- but withholding it silently is only half the job.
 * This is the other half: the same comparison run over every live row rather
 * than one applicant's slice, so a disagreement is visible to someone who can
 * resolve it. It resolves nothing itself and writes nothing.
 */
export function findStaticLiveConflicts(
  live: LiveVerifiedDeadline[],
  staticRecords: DeadlineRecord[]
): ReportedConflict[] {
  const out: ReportedConflict[] = [];

  for (const d of live) {
    // Compare against the curated records for this row's own audience only.
    // A record for another programme or cycle is a different deadline, not a
    // disagreement about this one.
    const relevant = staticRecords.filter(
      (s) =>
        s.program === d.program &&
        s.cycle === d.cycle &&
        (s.track === null || d.track === null || s.track === d.track)
    );
    for (const c of mergeWithStatic([d], relevant).conflicts) {
      out.push({
        liveId: d.id,
        program: d.program,
        track: d.track,
        cycle: d.cycle,
        deadlineType: d.deadlineType,
        staticDate: c.staticDeadline,
        liveDate: c.liveDeadline,
        sourceUrl: d.sourceUrl,
        reason:
          `the curated dataset states ${c.staticDeadline} for this programme, cycle, track and deadline type; ` +
          `the verified live record states ${c.liveDeadline}. The curated date is what applicants see until this is resolved.`,
      });
    }
  }
  return out;
}

/**
 * Presents a live row in the shape the matcher already uses, so upcoming /
 * historical and every downstream consumer treat it identically to a curated
 * one. The synthetic source is marked so a card can say where it came from
 * without the matcher needing to branch.
 */
export function toDeadlineRecord(d: LiveVerifiedDeadline): DeadlineRecord & { source: OfficialSource } {
  return {
    id: `live:${d.id}`,
    program: d.program,
    cycle: d.cycle,
    track: d.track,
    scope: "application",
    label: d.label,
    deadline: d.deadline,
    status: "verified",
    source_id: `live:${d.id}`,
    source: {
      id: `live:${d.id}`,
      publisher: "NIIED / Study in Korea",
      title: d.label,
      url: d.sourceUrl,
      published_at: d.deadline,
    },
  };
}
