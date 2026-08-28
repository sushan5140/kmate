import type { DeadlineProposal } from "./schema";

/**
 * Deterministic deadline dedupe -- the gap the audit found.
 *
 * Notices, scholarships and the review queue all had dedupe; deadlines had
 * none at all. The keys below are ordered strongest first, exactly as the
 * review queue's are, so the reasoning is the same one already in the
 * codebase rather than a second competing scheme.
 *
 * The rule that matters most is a negative one: two deadlines are NEVER
 * merged across scopes. A country-level deadline and a global one may share a
 * date, a programme and a label and still be different facts -- an embassy in
 * one country closing on the same day NIIED does is a coincidence, not an
 * identity. Merging them would delete a real deadline for real applicants.
 */

export interface DeadlineIdentity {
  program: string | null;
  cycle: number | null;
  track: string | null;
  scope_type: string | null;
  country: string | null;
  university: string | null;
  deadline_type: string | null;
  date: string | null;
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/**
 * Key 1 -- the official record itself. Strongest, because it is the source's
 * own identity for the notice plus the exact date and kind we read from it.
 */
export function sourceKey(sourceUrl: string, sourceNoticeId: string | null, d: DeadlineIdentity): string {
  return [norm(sourceNoticeId) || norm(sourceUrl), norm(d.date), norm(d.deadline_type)].join("|");
}

/**
 * Key 2 -- the semantic identity of the deadline. Scope is part of the key,
 * which is what keeps country and university deadlines separate from global
 * ones even when everything else matches.
 */
export function scopeKey(d: DeadlineIdentity): string {
  return [
    norm(d.program),
    d.cycle ?? "",
    norm(d.track),
    norm(d.scope_type),
    norm(d.country),
    norm(d.university),
    norm(d.deadline_type),
    norm(d.date),
  ].join("|");
}

/**
 * Key 3 -- weakest fallback: a normalised label plus the date. Used only when
 * neither of the above can be formed, and never on its own to merge across
 * differing scopes.
 */
export function labelKey(label: string, date: string | null): string {
  return `${label.trim().toLowerCase().replace(/\s+/g, " ")}|${date ?? ""}`;
}

export interface ExistingDeadline extends DeadlineIdentity {
  id: string;
  sourceUrl: string;
  sourceNoticeId: string | null;
}

export interface DuplicateMatch {
  id: string;
  /** Which key matched, for the audit trail and the admin's benefit. */
  via: "source" | "scope";
}

/**
 * Finds an existing deadline that is the SAME deadline as the proposal.
 *
 * Returns null when nothing matches -- including when a row shares the date
 * but sits in a different scope, which is a different deadline and must be
 * kept.
 */
export function findDuplicate(
  proposal: DeadlineProposal,
  sourceUrl: string,
  sourceNoticeId: string | null,
  existing: ExistingDeadline[]
): DuplicateMatch | null {
  const identity: DeadlineIdentity = {
    program: proposal.program,
    cycle: proposal.cycle,
    track: proposal.track,
    scope_type: proposal.scope_type,
    country: proposal.country,
    university: proposal.university,
    deadline_type: proposal.deadline_type,
    date: proposal.date,
  };

  const mySource = sourceKey(sourceUrl, sourceNoticeId, identity);
  const myScope = scopeKey(identity);

  for (const e of existing) {
    if (sourceKey(e.sourceUrl, e.sourceNoticeId, e) === mySource) return { id: e.id, via: "source" };
  }
  for (const e of existing) {
    // Scope must match on every axis, including the scope fields themselves.
    if (scopeKey(e) === myScope) return { id: e.id, via: "scope" };
  }
  return null;
}

export type ReconcileOutcome =
  | { kind: "duplicate"; existingId: string; via: "source" | "scope" }
  | { kind: "conflict"; existingId: string; existingDate: string; reason: string }
  | { kind: "extension"; existingId: string; existingDate: string; reason: string }
  | { kind: "new" };

/**
 * Compares a proposal against deadlines already held for the same scope.
 *
 * Three outcomes that are not "new":
 *   duplicate  -- identical in every respect; nothing to do
 *   extension  -- same scope, LATER date, and the notice says so explicitly
 *   conflict   -- same scope, different date, with no explicit extension
 *
 * An extension is only ever PROPOSED. Superseding a verified deadline is left
 * to a person, because "extended to" in one notice and a contradicting date
 * in another look identical from here, and picking wrong silently moves a
 * real deadline.
 */
export function reconcile(
  proposal: DeadlineProposal,
  sourceUrl: string,
  sourceNoticeId: string | null,
  existing: ExistingDeadline[],
  noticeText: string
): ReconcileOutcome {
  const dup = findDuplicate(proposal, sourceUrl, sourceNoticeId, existing);
  if (dup) return { kind: "duplicate", existingId: dup.id, via: dup.via };

  // Same scope ignoring the date -- i.e. a competing date for one deadline.
  const sameScope = existing.filter(
    (e) =>
      norm(e.program) === norm(proposal.program) &&
      (e.cycle ?? "") === (proposal.cycle ?? "") &&
      norm(e.track) === norm(proposal.track) &&
      norm(e.scope_type) === norm(proposal.scope_type) &&
      norm(e.country) === norm(proposal.country) &&
      norm(e.university) === norm(proposal.university) &&
      norm(e.deadline_type) === norm(proposal.deadline_type) &&
      e.date !== proposal.date
  );
  if (sameScope.length === 0) return { kind: "new" };

  const rival = sameScope[0];
  const saysExtended = /\bextend(?:ed|s|ing)?\s+(?:to|until)\b|\bdeadline (?:has been )?extended\b/i.test(noticeText);
  const isLater = !!proposal.date && !!rival.date && proposal.date > rival.date;

  if (saysExtended && isLater) {
    return {
      kind: "extension",
      existingId: rival.id,
      existingDate: rival.date!,
      reason: `the notice states an extension and the new date (${proposal.date}) is later than the existing one (${rival.date})`,
    };
  }
  return {
    kind: "conflict",
    existingId: rival.id,
    existingDate: rival.date!,
    reason: `a verified deadline already exists for this scope on ${rival.date}, and this notice states ${proposal.date} without an explicit extension`,
  };
}
