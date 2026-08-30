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

/** Safety ceiling on replies per rolling 24h. Overridden by YOUTUBE_DAILY_POST_LIMIT. */
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
export function canPost(row: QueueRowFacts): boolean {
  return (
    row.status === "APPROVED" &&
    !row.is_legacy &&
    !row.posted_reply_id &&
    row.source_type === "comment" &&
    row.automation_action === "POST" &&
    resolveDraft(row).length > 0
  );
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
