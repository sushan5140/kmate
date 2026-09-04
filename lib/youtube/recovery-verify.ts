/**
 * Exact-reply-id verification rules for recovery attempts.
 *
 * Pure module: no `server-only`, no Supabase, no network, no clock of its own.
 * Everything that decides whether a legacy reply is gone lives here so it can
 * be tested directly, and the script in supabase/scripts/ is left as a thin
 * shell around it.
 *
 * The property this file exists to protect: a recovery attempt may only be
 * approved once the reply it replaces is PROVEN gone. So "gone" has to mean
 * one specific, observable thing -- an exact-id `comments.list` that returns an
 * empty `items` array -- and every other outcome, including every flavour of
 * failure, must land somewhere that is NOT removed. An unreachable API, a
 * quota error and a malformed body are all "we do not know", and treating any
 * of them as removal would manufacture the permission to repost.
 */

/** The channel these replies belong to. Verified before any lookup runs. */
export const EXPECTED_CHANNEL_ID = "UCkX7YBd1ChGcJWOFHTGSLXQ";
export const EXPECTED_CHANNEL_TITLE = "Sushan";

export const VERIFICATION_METHOD = "exact_reply_id_api_check";

export const VERIFICATION_RESULTS = [
  "CONFIRMED_REMOVED",
  "STILL_LIVE",
  "API_ERROR",
  "AMBIGUOUS",
] as const;

export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];

/** Only CONFIRMED_REMOVED may ever unlock approval. */
export function provesRemoval(result: VerificationResult): boolean {
  return result === "CONFIRMED_REMOVED";
}

// ---------------------------------------------------------------------------
// Read-only enforcement
// ---------------------------------------------------------------------------

/**
 * The only YouTube endpoints this tool may touch.
 *
 * An allow-list rather than a deny-list: a deny-list of "insert, update,
 * delete" would silently permit any endpoint nobody thought to name. Every
 * request is checked against this immediately before it is sent.
 */
const ALLOWED_ENDPOINTS = [
  "https://oauth2.googleapis.com/token",
  "https://www.googleapis.com/youtube/v3/channels",
  "https://www.googleapis.com/youtube/v3/comments",
] as const;

/** Methods a read-only tool may use. POST is permitted ONLY for the token grant. */
export function isReadOnlyYoutubeRequest(url: string, method: string): boolean {
  const endpoint = ALLOWED_ENDPOINTS.find((allowed) => url.startsWith(allowed));
  if (!endpoint) return false;

  // The OAuth token endpoint is a POST by protocol, and it mutates nothing on
  // the channel. Everything else must be a GET.
  if (endpoint === "https://oauth2.googleapis.com/token") {
    return method.toUpperCase() === "POST";
  }
  return method.toUpperCase() === "GET";
}

export class ReadOnlyViolationError extends Error {
  constructor(url: string, method: string) {
    super(`Refused a non-read-only YouTube request: ${method} ${url.split("?")[0]}`);
    this.name = "ReadOnlyViolationError";
  }
}

/** Throws unless the request is one of the three permitted read-only calls. */
export function assertReadOnlyRequest(url: string, method: string): void {
  if (!isReadOnlyYoutubeRequest(url, method)) throw new ReadOnlyViolationError(url, method);
}

// ---------------------------------------------------------------------------
// Channel identity
// ---------------------------------------------------------------------------

export interface ChannelIdentity {
  id: string | null;
  title: string | null;
}

export type ChannelVerdict =
  | { ok: true; id: string; title: string | null; titleMatches: boolean }
  | { ok: false; reason: "no_channel" | "channel_mismatch"; id: string | null };

/**
 * Whether the authenticated credentials own the expected channel.
 *
 * The ID is the identity and a mismatch aborts: a channel can be renamed, but
 * its id cannot, so refusing on the id is the check that actually means
 * something. A differing title is reported rather than fatal.
 */
export function verifyChannel(identity: ChannelIdentity): ChannelVerdict {
  if (!identity.id) return { ok: false, reason: "no_channel", id: null };
  if (identity.id !== EXPECTED_CHANNEL_ID) {
    return { ok: false, reason: "channel_mismatch", id: identity.id };
  }
  return {
    ok: true,
    id: identity.id,
    title: identity.title,
    titleMatches: identity.title === EXPECTED_CHANNEL_TITLE,
  };
}

// ---------------------------------------------------------------------------
// Classifying one exact-id lookup
// ---------------------------------------------------------------------------

export interface LookupOutcome {
  /** HTTP status, or 0 when the request never completed. */
  status: number;
  /** Parsed JSON body, or null when the body was absent or unparseable. */
  body: unknown;
  /** Set when the request threw before a response arrived. */
  networkError?: string;
}

export interface Classification {
  result: VerificationResult;
  detail: string;
}

/**
 * Turns one `comments.list?id=<exact>` response into a verdict.
 *
 * The removal signal is narrow on purpose: HTTP 200, a body carrying an
 * `items` ARRAY, and that array empty. That is the same signal the original
 * post-hoc audit relied on when it discovered most of the old bot's replies
 * were gone.
 *
 * Everything else is deliberately not removal:
 *
 *   - 200 with a non-array or missing `items` -> AMBIGUOUS. A shape we do not
 *     recognise is not evidence of anything.
 *   - 404 -> AMBIGUOUS, NOT removed. comments.list answers an unknown id with
 *     200 and an empty list, so a 404 more likely means a malformed request
 *     than a deleted comment, and guessing in the permissive direction is
 *     exactly the mistake this whole feature exists to prevent.
 *   - 401/403/429/5xx and transport failures -> API_ERROR.
 */
export function classifyLookup(outcome: LookupOutcome): Classification {
  if (outcome.networkError) {
    return { result: "API_ERROR", detail: `network: ${outcome.networkError}` };
  }

  if (outcome.status === 404) {
    return {
      result: "AMBIGUOUS",
      detail: "http 404 — comments.list answers an unknown id with 200/empty, so this is not read as removal",
    };
  }

  if (outcome.status !== 200) {
    const reason = googleErrorReason(outcome.body) ?? `http_${outcome.status}`;
    return { result: "API_ERROR", detail: `http ${outcome.status} (${reason})` };
  }

  if (!outcome.body || typeof outcome.body !== "object") {
    return { result: "AMBIGUOUS", detail: "200 with no parseable body" };
  }

  const items = (outcome.body as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return { result: "AMBIGUOUS", detail: "200 but the body carried no items array" };
  }

  return items.length > 0
    ? { result: "STILL_LIVE", detail: `found ${items.length}` }
    : { result: "CONFIRMED_REMOVED", detail: "empty items" };
}

/** Google's short error reason, when the body carries one. */
export function googleErrorReason(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const errors = (error as { errors?: unknown }).errors;
  if (Array.isArray(errors) && errors[0] && typeof errors[0] === "object") {
    const reason = (errors[0] as { reason?: unknown }).reason;
    if (typeof reason === "string") return reason;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "string" ? status : null;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/** The only keys this tool is allowed to add to legacy_evidence. */
export const VERIFICATION_EVIDENCE_KEYS = [
  "verification_method",
  "checked_at",
  "result",
  "authenticated_channel_id",
] as const;

/**
 * Merges a verification result into existing evidence WITHOUT losing anything.
 *
 * The import-time provenance -- the source workbook hashes, the matching
 * method, the recovery-queue notes -- is how anyone later reconstructs where
 * a row came from. A verification adds four keys beside it and overwrites
 * nothing else, so running this tool twice refreshes the check without
 * eroding the history of the import.
 */
export function buildVerificationEvidence(
  existing: Record<string, unknown> | null,
  input: { result: VerificationResult; checkedAt: string; channelId: string }
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    verification_method: VERIFICATION_METHOD,
    checked_at: input.checkedAt,
    result: input.result,
    authenticated_channel_id: input.channelId,
  };
}

// ---------------------------------------------------------------------------
// Reading the latest verification back out, for the approval gate
// ---------------------------------------------------------------------------

/**
 * The latest exact-ID check recorded on a row.
 *
 * `result` is null when evidence of a check is present but unreadable -- an
 * unrecognised method, a missing or non-string result, a result string that is
 * not one of VERIFICATION_RESULTS. That is a distinct state from "never
 * checked", and it must be, because the two get opposite answers below.
 */
export interface LatestVerification {
  result: VerificationResult | null;
  method: string | null;
  checkedAt: string | null;
  channelId: string | null;
}

/** True when a row carries any trace of an exact-ID verification. */
function hasVerificationTrace(evidence: Record<string, unknown> | null): boolean {
  if (!evidence) return false;
  // `verification_method` and `result` are written together by
  // buildVerificationEvidence and are not keys the importer produces, so
  // either one alone still means a verification was attempted on this row.
  return "verification_method" in evidence || "result" in evidence;
}

/**
 * The latest exact-ID verification stored on a row, or null if never checked.
 *
 * There is one verification block per row rather than a history array: the
 * verifier overwrites the four keys on each run, so "latest" is simply "what
 * is stored". This function is the single reader of that shape, so if the
 * evidence ever grows a real history the change lands in one place.
 */
export function readLatestVerification(
  evidence: Record<string, unknown> | null
): LatestVerification | null {
  if (!hasVerificationTrace(evidence)) return null;

  const method = evidence?.verification_method;
  const rawResult = evidence?.result;
  const checkedAt = evidence?.checked_at;
  const channelId = evidence?.authenticated_channel_id;

  const methodOk = method === VERIFICATION_METHOD;
  const resultOk =
    typeof rawResult === "string" &&
    (VERIFICATION_RESULTS as readonly string[]).includes(rawResult);

  return {
    // A result recorded by some other method is not a result this gate can
    // interpret, so it reads as unreadable rather than as its face value.
    result: methodOk && resultOk ? (rawResult as VerificationResult) : null,
    method: typeof method === "string" ? method : null,
    checkedAt: typeof checkedAt === "string" ? checkedAt : null,
    channelId: typeof channelId === "string" ? channelId : null,
  };
}

export type VerificationApproveRefusal =
  | "verification_still_live"
  | "verification_inconclusive"
  | "verification_unreadable";

/**
 * Whether the latest exact-ID check permits approving this row.
 *
 * This is the fail-closed half of the approval gate, and it exists because
 * `legacy_outcome` is a historical record that is deliberately never
 * downgraded. A row confirmed removed in September and found STILL_LIVE today
 * keeps its stored outcome -- that is correct for provenance -- but it must
 * stop being approvable the moment the contradiction is observed. Otherwise
 * the very check that discovered the problem leaves the row exactly as
 * postable as before it ran.
 *
 * Only CONFIRMED_REMOVED clears the gate. STILL_LIVE contradicts the premise
 * of the whole recovery (there is nothing to replace). API_ERROR and AMBIGUOUS
 * are "we do not know", and "we do not know" is never permission to post.
 *
 * A row that has never been checked returns null and falls through to the
 * pre-existing legacy_outcome rule, so adding this gate cannot make anything
 * approvable that was not approvable before -- it only ever subtracts.
 */
export function verificationApproveRefusal(
  evidence: Record<string, unknown> | null
): VerificationApproveRefusal | null {
  const latest = readLatestVerification(evidence);
  if (!latest) return null;
  if (latest.result === "CONFIRMED_REMOVED") return null;
  if (latest.result === "STILL_LIVE") return "verification_still_live";
  if (latest.result === null) return "verification_unreadable";
  return "verification_inconclusive";
}

// ---------------------------------------------------------------------------
// What a write is allowed to touch
// ---------------------------------------------------------------------------

/**
 * The complete set of columns --apply-evidence may write.
 *
 * Everything governing whether a reply gets SENT is absent: status,
 * posted_reply_id, api_accepted_at, verified_at, attempt_count,
 * last_attempt_at, decided_at, decided_by, draft_text. This tool records what
 * it observed; it never advances the workflow.
 */
export const WRITABLE_COLUMNS = ["legacy_outcome", "legacy_evidence", "updated_at"] as const;

export type WritableColumn = (typeof WRITABLE_COLUMNS)[number];

export class ForbiddenWriteError extends Error {
  constructor(columns: string[]) {
    super(`Refused a write touching forbidden columns: ${columns.join(", ")}`);
    this.name = "ForbiddenWriteError";
  }
}

/** Throws unless every key of the patch is in WRITABLE_COLUMNS. */
export function assertWritablePatch(patch: Record<string, unknown>): void {
  const forbidden = Object.keys(patch).filter(
    (key) => !(WRITABLE_COLUMNS as readonly string[]).includes(key)
  );
  if (forbidden.length > 0) throw new ForbiddenWriteError(forbidden);
}

export interface RecoveryRowForVerification {
  recovery_order: number;
  legacy_reply_id: string;
  legacy_outcome: string;
  legacy_evidence: Record<string, unknown> | null;
  status: string;
}

export interface RowPlan {
  order: number;
  legacyReplyId: string;
  result: VerificationResult;
  detail: string;
  previousOutcome: string;
  nextOutcome: string;
  /** True when --apply-evidence would change legacy_outcome for this row. */
  upgrades: boolean;
  /** True when --apply-evidence would write anything at all for this row. */
  writes: boolean;
}

/**
 * What --apply-evidence would do to one row, decided without touching a database.
 *
 * An outcome is only ever upgraded, never downgraded: a row already recorded
 * as CONFIRMED_REMOVED whose re-check comes back API_ERROR keeps its earlier,
 * better-evidenced verdict rather than being demoted by a transient failure.
 * A re-check that comes back STILL_LIVE is reported loudly but still does not
 * rewrite the stored outcome -- that contradiction is a human's call, not a
 * script's.
 */
export function planRow(
  row: RecoveryRowForVerification,
  classification: Classification
): RowPlan {
  const upgrades =
    provesRemoval(classification.result) && row.legacy_outcome !== "CONFIRMED_REMOVED";

  return {
    order: row.recovery_order,
    legacyReplyId: row.legacy_reply_id,
    result: classification.result,
    detail: classification.detail,
    previousOutcome: row.legacy_outcome,
    nextOutcome: upgrades ? "CONFIRMED_REMOVED" : row.legacy_outcome,
    upgrades,
    // Evidence is refreshed on every checked row; the outcome only moves up.
    writes: true,
  };
}

export interface VerificationSummary {
  checked: number;
  confirmedRemoved: number;
  stillLive: number;
  apiError: number;
  ambiguous: number;
  wouldUpgrade: number;
  contradictions: number;
}

export function summarise(plans: RowPlan[]): VerificationSummary {
  const count = (result: VerificationResult) => plans.filter((p) => p.result === result).length;
  return {
    checked: plans.length,
    confirmedRemoved: count("CONFIRMED_REMOVED"),
    stillLive: count("STILL_LIVE"),
    apiError: count("API_ERROR"),
    ambiguous: count("AMBIGUOUS"),
    wouldUpgrade: plans.filter((p) => p.upgrades).length,
    // Stored as removed, but the API now says it is live. Never auto-resolved.
    contradictions: plans.filter(
      (p) => p.previousOutcome === "CONFIRMED_REMOVED" && p.result === "STILL_LIVE"
    ).length,
  };
}
