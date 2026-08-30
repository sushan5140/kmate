/**
 * YouTube outreach -- statuses, transition rules, and the safety predicates.
 *
 * Pure module: no `server-only`, no Supabase, no network. Client components,
 * route handlers and the regression suite all import from here, so the rules
 * that matter are stated once and tested directly.
 *
 * The history this encodes: a local Python bot posted 120 replies in bulk,
 * checked each one five seconds after posting, and reported every one as
 * "VERIFIED LIVE". A later audit that queried the exact reply ids YouTube had
 * returned found most of them gone. So "the API accepted it" and "the reply
 * is live" are two different facts here, and only a delayed check may
 * establish the second.
 */

export const YOUTUBE_STATUSES = [
  "SCRAPED",
  "DRAFTED",
  "APPROVED",
  "POSTING",
  "API_ACCEPTED",
  "VERIFIED_LIVE",
  "HOLD",
  "SKIP",
  "REMOVED",
  "FAILED",
] as const;

export type YoutubeReplyStatus = (typeof YOUTUBE_STATUSES)[number];

export const YOUTUBE_EVENT_TYPES = [
  "IMPORTED",
  "LEGACY_IMPORTED",
  "DRAFT_EDITED",
  "APPROVED",
  "HELD",
  "SKIPPED",
  "POST_CLAIMED",
  "API_ACCEPTED",
  "POST_FAILED",
  "VERIFY_FOUND",
  "VERIFY_NOT_FOUND",
  "REMOVED",
] as const;

export type YoutubeEventType = (typeof YOUTUBE_EVENT_TYPES)[number];

/**
 * Safety ceiling on replies. Overridden by YOUTUBE_DAILY_POST_LIMIT.
 *
 * Applied to BOTH windows -- the local calendar day and a rolling 24 hours --
 * so "no more than five a day" holds for either reading of "day". See
 * batchAllowance() for why one number governs both.
 */
export const DEFAULT_DAILY_POST_LIMIT = 5;

/**
 * How long a reply must have existed before an existence check means
 * anything. Overridden by YOUTUBE_MIN_VERIFY_AGE_HOURS.
 *
 * This is the single most important number in the feature. The old bot used
 * five seconds and was confidently wrong about all 120 replies.
 */
export const DEFAULT_MIN_VERIFY_AGE_HOURS = 24;

/** Hard ceiling on an uploaded spreadsheet, before parsing. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Hard ceiling on rows accepted from one upload.
 *
 * The byte cap alone is not enough: a small file can hold tens of thousands
 * of rows, and the import writes each row and its audit event separately, so
 * a very large sheet would run past the request timeout and leave a partial
 * batch behind. Refusing up front is better than importing half a sheet.
 */
export const MAX_IMPORT_ROWS = 2000;

/**
 * Terminal states. REMOVED is terminal because reposting a reply YouTube
 * already took down is the exact behaviour that caused the previous harm --
 * so there is no transition out of it, and `canApprove` refuses it.
 */
export const TERMINAL_STATUSES: readonly YoutubeReplyStatus[] = ["REMOVED"];

/**
 * Statuses a browser is allowed to ask for, by verb. POSTING is deliberately
 * absent: it is an internal claim the posting route makes on itself, and no
 * request body anywhere in the feature carries a status string.
 */
export const DECISION_ACTIONS = {
  approve: "APPROVED",
  hold: "HOLD",
  skip: "SKIP",
  mark_failed: "FAILED",
} as const;

export type DecisionAction = keyof typeof DECISION_ACTIONS;

export function isDecisionAction(value: unknown): value is DecisionAction {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DECISION_ACTIONS, value);
}

export function isYoutubeStatus(value: unknown): value is YoutubeReplyStatus {
  return typeof value === "string" && (YOUTUBE_STATUSES as readonly string[]).includes(value);
}

/** The subset of a queue row the rules below actually reason about. */
export interface QueueRowFacts {
  status: YoutubeReplyStatus;
  source_type: string | null;
  automation_action: string | null;
  final_draft: string | null;
  edited_draft: string | null;
  posted_reply_id: string | null;
  is_legacy: boolean;
  api_accepted_at: string | null;
  /**
   * The admin intends to answer this one personally. Excludes the row from
   * posting entirely -- single and batch alike -- because "I will handle this
   * myself" is not a preference the batch should be free to overrule.
   */
  manual_follow_up: boolean;
}

/** The text that would actually be posted: an admin edit wins over the import. */
export function resolveDraft(row: Pick<QueueRowFacts, "final_draft" | "edited_draft">): string {
  const edited = row.edited_draft?.trim();
  if (edited) return edited;
  return row.final_draft?.trim() ?? "";
}

export type ApproveRefusal =
  | "terminal"
  | "legacy"
  | "already_posted"
  | "not_top_level"
  | "action_not_post"
  | "no_draft"
  | "in_flight";

/**
 * Whether an admin may move this row to APPROVED -- the only postable state.
 *
 * Approving is refused for anything that could never legally post, rather
 * than allowed and then blocked at the posting step. A row sitting in
 * APPROVED that the posting route would reject is a trap: it reads as ready.
 *
 * FAILED is deliberately approvable. That is the whole of correction 2 --
 * a failed row returns to APPROVED only because a human clicked, never
 * automatically, so nothing retries a post on its own.
 */
export function approveRefusal(row: QueueRowFacts): ApproveRefusal | null {
  if (TERMINAL_STATUSES.includes(row.status)) return "terminal";
  if (row.is_legacy) return "legacy";
  if (row.posted_reply_id) return "already_posted";
  if (row.status === "POSTING") return "in_flight";
  if (row.status === "API_ACCEPTED" || row.status === "VERIFIED_LIVE") return "already_posted";
  if (row.source_type !== "comment") return "not_top_level";
  if (row.automation_action !== "POST") return "action_not_post";
  if (!resolveDraft(row)) return "no_draft";
  return null;
}

export function canApprove(row: QueueRowFacts): boolean {
  return approveRefusal(row) === null;
}

/**
 * Whether the posting route may act on this row at all.
 *
 * Every one of these is re-checked server-side against the stored row
 * immediately before the API call. The request body carries no comment id and
 * no reply text, so this predicate -- not the browser -- decides what posts.
 */
export type PostRefusal =
  | "not_approved"
  | "legacy"
  | "already_posted"
  | "not_top_level"
  | "action_not_post"
  | "no_draft"
  | "manual_follow_up";

/**
 * Why this row may not be posted, or null when it may.
 *
 * Every batch member is re-checked against this, individually, immediately
 * before its own API call -- a row's presence in a requested batch grants it
 * nothing. The reason is returned rather than a bare boolean so the batch
 * report and the UI can both say precisely why a row was passed over.
 */
export function postRefusal(row: QueueRowFacts): PostRefusal | null {
  if (row.status !== "APPROVED") return "not_approved";
  if (row.is_legacy) return "legacy";
  if (row.posted_reply_id) return "already_posted";
  if (row.source_type !== "comment") return "not_top_level";
  if (row.automation_action !== "POST") return "action_not_post";
  if (row.manual_follow_up) return "manual_follow_up";
  if (!resolveDraft(row)) return "no_draft";
  return null;
}

export function canPost(row: QueueRowFacts): boolean {
  return postRefusal(row) === null;
}

/** hold / skip are refused only where they would contradict a posted reality. */
export function canHoldOrSkip(row: QueueRowFacts): boolean {
  if (TERMINAL_STATUSES.includes(row.status)) return false;
  if (row.posted_reply_id) return false;
  return row.status !== "POSTING" && row.status !== "API_ACCEPTED" && row.status !== "VERIFIED_LIVE";
}

/**
 * mark_failed exists for one situation: a post attempt whose outcome is
 * unknown (the request died in flight), which leaves the row claimed as
 * POSTING. Only an admin who has checked YouTube may release it, and it
 * lands in FAILED -- needing a second, separate approval before any retry.
 */
export function canMarkFailed(row: QueueRowFacts): boolean {
  return row.status === "POSTING";
}

/** An admin may edit the draft right up until the row is claimed for posting. */
export function canEditDraft(row: QueueRowFacts): boolean {
  return ["SCRAPED", "DRAFTED", "APPROVED", "HOLD", "SKIP", "FAILED"].includes(row.status);
}

export type VerifyRefusal = "no_reply_id" | "terminal" | "wrong_status" | "too_early";

/**
 * Whether an existence check against YouTube is meaningful yet.
 *
 * `minAgeHours` is the guard against repeating the original mistake. A reply
 * queried seconds after creation is always found, which tells you nothing
 * about whether it survives. Legacy rows bypass the age gate: they were
 * posted by the old bot long before the row was imported, so `created_at`
 * says nothing about the reply's age and the reply is definitionally old.
 *
 * VERIFIED_LIVE is re-verifiable on purpose. Being live once is not
 * permanent, and a re-check may legitimately move it to REMOVED.
 */
export function verifyRefusal(
  row: QueueRowFacts,
  now: Date,
  minAgeHours: number
): VerifyRefusal | null {
  if (!row.posted_reply_id) return "no_reply_id";
  if (row.status === "REMOVED") return "terminal";
  if (row.status !== "API_ACCEPTED" && row.status !== "VERIFIED_LIVE") return "wrong_status";
  if (row.is_legacy) return null;
  if (!row.api_accepted_at) return "too_early";

  const ageMs = now.getTime() - new Date(row.api_accepted_at).getTime();
  if (!Number.isFinite(ageMs) || ageMs < minAgeHours * 60 * 60 * 1000) return "too_early";
  return null;
}

export function canVerify(row: QueueRowFacts, now: Date, minAgeHours: number): boolean {
  return verifyRefusal(row, now, minAgeHours) === null;
}

/**
 * Reads a positive integer limit from an env value, falling back to the
 * default for anything absent, unparseable, zero or negative. A malformed
 * YOUTUBE_DAILY_POST_LIMIT must tighten to the default, never uncap.
 */
export function readPositiveIntEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

/** Upper bound on rows one manually-triggered batch may even ask for. */
export const MAX_BATCH_REQUEST = 25;

export interface BatchAllowance {
  /** The configured ceiling, applied to BOTH windows. */
  limit: number;

  /** Sent or in flight inside the local calendar day. */
  dayUsed: number;
  /** limit - dayUsed, never negative. */
  dayRemaining: number;

  /** Sent or in flight inside the last rolling 24 hours. */
  rollingUsed: number;
  /** limit - rollingUsed, never negative. */
  rollingRemaining: number;

  /** min(dayRemaining, rollingRemaining) -- what may actually be sent now. */
  effectiveRemaining: number;

  /** How many rows pass every safety check right now. */
  eligible: number;
  /** The largest batch that could be run at this moment. */
  maxBatch: number;
}

/**
 * What a batch is allowed to be, right now.
 *
 * TWO ceilings on volume, not one, and the stricter always wins.
 *
 * The calendar-day window is what the admin sees: it matches the Today
 * dashboard, so "4 / 5 today" means the same thing on screen and on the
 * server. On its own, though, it resets at local midnight -- which would
 * permit five replies at 23:55 and five more at 00:05, ten inside ten
 * minutes. That is a burst, and bursting is the exact behaviour this feature
 * exists to replace.
 *
 * So a rolling 24-hour window sits underneath as a backstop. It has no
 * boundary to reset across, and it uses the same YOUTUBE_DAILY_POST_LIMIT: a
 * second variable would be one more thing to misconfigure for no gain, and
 * the intent of both is identical -- "no more than N replies in a day, for
 * any reading of the word day".
 *
 * The dashboard may therefore show a day allowance the server will refuse.
 * That is intended and surfaced, not hidden: after a late-night run the day
 * counter reads 0 / 5 while the effective allowance is still 0 until those
 * replies age out of the rolling window.
 *
 * Both windows count accepted replies AND in-flight POSTING claims, and a
 * reply later found REMOVED still counts -- the ceiling limits what was sent,
 * so a removal cannot buy back an attempt.
 *
 * This is only a plan. The posting loop re-derives the whole allowance from
 * the database before every single row, so a stale or forged plan cannot buy
 * one extra reply.
 */
export function batchAllowance(
  limit: number,
  dayUsed: number,
  rollingUsed: number,
  eligible: number
): BatchAllowance {
  const dayRemaining = Math.max(0, limit - dayUsed);
  const rollingRemaining = Math.max(0, limit - rollingUsed);
  const effectiveRemaining = Math.min(dayRemaining, rollingRemaining);

  return {
    limit,
    dayUsed,
    dayRemaining,
    rollingUsed,
    rollingRemaining,
    effectiveRemaining,
    eligible,
    maxBatch: Math.min(effectiveRemaining, eligible, MAX_BATCH_REQUEST),
  };
}

/** Clamps a requested batch size to what is actually permitted. */
export function clampBatchSize(requested: number, allowance: BatchAllowance): number {
  if (!Number.isFinite(requested) || !Number.isInteger(requested) || requested <= 0) return 0;
  return Math.min(requested, allowance.maxBatch);
}

/** Presentation grouping: API_ACCEPTED must never render as success. */
export type OutcomeTone = "neutral" | "pending" | "success" | "danger";

export function statusTone(status: YoutubeReplyStatus): OutcomeTone {
  switch (status) {
    case "VERIFIED_LIVE":
      return "success";
    case "API_ACCEPTED":
    case "POSTING":
      return "pending";
    case "REMOVED":
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

export const STATUS_LABELS: Record<YoutubeReplyStatus, string> = {
  SCRAPED: "Scraped",
  DRAFTED: "Drafted",
  APPROVED: "Approved",
  POSTING: "Posting…",
  API_ACCEPTED: "API accepted — unconfirmed",
  VERIFIED_LIVE: "Verified live",
  HOLD: "Hold",
  SKIP: "Skipped",
  REMOVED: "Removed by YouTube",
  FAILED: "Failed",
};
