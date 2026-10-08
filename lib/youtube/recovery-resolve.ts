/**
 * Resolving a recovery attempt stuck in POSTING.
 *
 * Pure module: no `server-only`, no Supabase, no network. I/O is injected, so
 * every branch -- including the ones that must refuse -- is driven directly by
 * the regression suite.
 *
 * A row is stuck when the send was claimed but the outcome is unknown: the
 * request died in flight, YouTube accepted without returning a usable id, or
 * the process was killed between the insert and the write-back. The reply may
 * or may not exist. Resolving means FINDING OUT, read-only, and it may only
 * conclude "it posted" on evidence strong enough that being wrong is not
 * plausible -- because concluding wrongly in either direction is expensive:
 * wrongly "posted" loses a reply forever, wrongly "not posted" invites a
 * duplicate under a real person's comment.
 *
 * So the rule is not "find a likely match". It is: exactly one reply, under
 * the expected parent, authored by the expected channel, whose text equals the
 * approved draft byte for byte, published in a window consistent with the
 * attempt. Anything else is a human's problem, and the row stays blocked.
 *
 * This module never creates anything. There is no insert here and no import of
 * one.
 */

import { EXPECTED_CHANNEL_ID, verifyChannel, type ChannelIdentity } from "./recovery-verify";

export const RESOLVER_TARGET_STATUS = "POSTING";

/**
 * How far a reply's publish time may sit outside the attempt window and still
 * be considered the same event.
 *
 * Generous enough to absorb clock skew between this server and YouTube, tight
 * enough that an unrelated reply posted hours later cannot be adopted. If the
 * timing does not fit, the candidate is rejected rather than stretched.
 */
export const RESOLVE_TIME_SKEW_MS = 10 * 60 * 1000;

export interface StuckRow {
  id: string;
  status: string;
  youtube_comment_id: string;
  draft_text: string;
  posted_reply_id: string | null;
  attempt_count: number;
  /** When the claim was taken. The reply, if it exists, was created after this. */
  last_attempt_at: string | null;
}

/** One reply as returned by comments.list?parentId=… , reduced to what we judge on. */
export interface ReplyCandidate {
  id: string | null;
  parentId: string | null;
  authorChannelId: string | null;
  textOriginal: string | null;
  publishedAt: string | null;
}

export type ResolveRefusal =
  | "not_stuck"
  | "already_posted"
  | "channel_mismatch"
  | "api_error"
  | "malformed_response"
  | "no_match"
  | "multiple_matches"
  | "listing_incomplete"
  | "no_attempt_time";

/** Why one candidate was or was not accepted. Reported, not just counted. */
export interface CandidateJudgement {
  id: string | null;
  matches: boolean;
  reasons: string[];
}

/**
 * Does this reply prove the send happened?
 *
 * Every condition is necessary. Dropping any one of them admits a class of
 * wrong answer: without the parent check a reply under a different comment
 * qualifies; without the author check someone else's reply does; without the
 * exact-text check an earlier draft or a similar answer does; without the
 * timing check a reply from the original 2026 bot run does -- and that last
 * one is the realistic failure here, because those replies were on these very
 * comments.
 */
export function judgeCandidate(
  candidate: ReplyCandidate,
  row: StuckRow,
  attemptStartedAt: number,
  now: number
): CandidateJudgement {
  const reasons: string[] = [];

  if (typeof candidate.id !== "string" || !candidate.id) reasons.push("no reply id");
  if (candidate.parentId !== row.youtube_comment_id) reasons.push("different parent comment");
  if (candidate.authorChannelId !== EXPECTED_CHANNEL_ID) reasons.push("author is not the expected channel");
  if (candidate.textOriginal !== row.draft_text) reasons.push("text is not the approved draft");

  if (typeof candidate.publishedAt !== "string") {
    reasons.push("no publish time");
  } else {
    const published = Date.parse(candidate.publishedAt);
    if (Number.isNaN(published)) {
      reasons.push("unreadable publish time");
    } else if (published < attemptStartedAt - RESOLVE_TIME_SKEW_MS) {
      reasons.push("published before the send attempt");
    } else if (published > now + RESOLVE_TIME_SKEW_MS) {
      reasons.push("published after now");
    }
  }

  return { id: candidate.id, matches: reasons.length === 0, reasons };
}

export interface ResolveDecision {
  refusal: ResolveRefusal | null;
  matched: CandidateJudgement | null;
  judgements: CandidateJudgement[];
}

/**
 * The whole confidence rule in one place: exactly one candidate must match.
 *
 * Zero means we have no evidence the reply exists -- which is NOT the same as
 * evidence it does not, so the row stays blocked either way. Two or more means
 * something is wrong that a person needs to look at; adopting one of them
 * would be a guess wearing a decision's clothes.
 */
export function decideResolution(
  candidates: ReplyCandidate[],
  row: StuckRow,
  attemptStartedAt: number,
  now: number
): ResolveDecision {
  const judgements = candidates.map((candidate) => judgeCandidate(candidate, row, attemptStartedAt, now));
  const matches = judgements.filter((judgement) => judgement.matches);

  if (matches.length === 1) return { refusal: null, matched: matches[0], judgements };
  if (matches.length > 1) return { refusal: "multiple_matches", matched: null, judgements };
  return { refusal: "no_match", matched: null, judgements };
}

/** Stored state that permits attempting a resolution at all. */
export function resolveRefusal(row: StuckRow): ResolveRefusal | null {
  if (row.posted_reply_id) return "already_posted";
  if (row.status !== RESOLVER_TARGET_STATUS) return "not_stuck";
  // Without a claim time there is no window to judge against, and a resolver
  // that will adopt a reply of any age is exactly the unsafe version.
  if (!row.last_attempt_at || Number.isNaN(Date.parse(row.last_attempt_at))) return "no_attempt_time";
  return null;
}

export type ResolveOutcome =
  | {
      ok: true;
      status: "API_ACCEPTED";
      postedReplyId: string;
      /** YouTube's own publish time. Never invented. */
      apiAcceptedAt: string;
    }
  | {
      ok: false;
      reason: ResolveRefusal;
      httpStatus: number;
      /** What was examined, so a human can pick up where this stopped. */
      judgements: CandidateJudgement[];
      posted: false;
    };

export interface ResolveDeps {
  loadRow(id: string): Promise<StuckRow | null>;
  authenticatedChannel(): Promise<ChannelIdentity>;
  /** Read-only listing of replies under one parent comment. */
  listReplies(parentId: string): Promise<
    | { ok: true; items: unknown; truncated: boolean; pages: number }
    | { ok: false; reason: "api_error" | "malformed_response" }
  >;
  /** Records the resolution. Guarded on the row still being POSTING. */
  markAccepted(id: string, replyId: string, apiAcceptedAt: string): Promise<boolean>;
  recordEvent(input: {
    resolved: boolean;
    reason: ResolveRefusal | null;
    replyId: string | null;
    publishedAt: string | null;
    examined: number;
    matched: number;
  }): Promise<void>;
  now(): number;
}

/** Reduces one raw API item to the fields the judgement uses. */
export function readCandidate(item: unknown): ReplyCandidate | null {
  if (!item || typeof item !== "object") return null;
  const record = item as { id?: unknown; snippet?: unknown };
  const snippet = (record.snippet ?? {}) as {
    parentId?: unknown;
    textOriginal?: unknown;
    publishedAt?: unknown;
    authorChannelId?: unknown;
  };
  const authorChannel = snippet.authorChannelId as { value?: unknown } | undefined;

  return {
    id: typeof record.id === "string" ? record.id : null,
    parentId: typeof snippet.parentId === "string" ? snippet.parentId : null,
    authorChannelId: typeof authorChannel?.value === "string" ? authorChannel.value : null,
    textOriginal: typeof snippet.textOriginal === "string" ? snippet.textOriginal : null,
    publishedAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : null,
  };
}

/**
 * Investigate one stuck row, read-only, and record what was found.
 *
 * Never sends. Never retries. The only write it can perform is recording an
 * accepted reply it positively identified, and that write is guarded on the
 * row still being POSTING.
 */
export async function executeStuckResolution(deps: ResolveDeps, id: string): Promise<ResolveOutcome> {
  const row = await deps.loadRow(id);
  if (!row) return { ok: false, reason: "not_stuck", httpStatus: 404, judgements: [], posted: false };

  const stored = resolveRefusal(row);
  if (stored) return { ok: false, reason: stored, httpStatus: 409, judgements: [], posted: false };

  const verdict = verifyChannel(await deps.authenticatedChannel());
  if (!verdict.ok) {
    await deps.recordEvent({
      resolved: false,
      reason: "channel_mismatch",
      replyId: null,
      publishedAt: null,
      examined: 0,
      matched: 0,
    });
    return { ok: false, reason: "channel_mismatch", httpStatus: 502, judgements: [], posted: false };
  }

  const listing = await deps.listReplies(row.youtube_comment_id);
  if (!listing.ok) {
    await deps.recordEvent({
      resolved: false,
      reason: listing.reason,
      replyId: null,
      publishedAt: null,
      examined: 0,
      matched: 0,
    });
    return { ok: false, reason: listing.reason, httpStatus: 503, judgements: [], posted: false };
  }

  if (!Array.isArray(listing.items)) {
    await deps.recordEvent({
      resolved: false,
      reason: "malformed_response",
      replyId: null,
      publishedAt: null,
      examined: 0,
      matched: 0,
    });
    return { ok: false, reason: "malformed_response", httpStatus: 503, judgements: [], posted: false };
  }

  // A partial list can prove neither presence nor uniqueness. Refusing here is
  // the difference between "we did not find it" and "we did not finish looking".
  if (listing.truncated) {
    await deps.recordEvent({
      resolved: false,
      reason: "listing_incomplete",
      replyId: null,
      publishedAt: null,
      examined: Array.isArray(listing.items) ? listing.items.length : 0,
      matched: 0,
    });
    return { ok: false, reason: "listing_incomplete", httpStatus: 503, judgements: [], posted: false };
  }

  const candidates = listing.items
    .map(readCandidate)
    .filter((candidate): candidate is ReplyCandidate => candidate !== null);

  const decision = decideResolution(
    candidates,
    row,
    Date.parse(row.last_attempt_at as string),
    deps.now()
  );
  const matchedCount = decision.judgements.filter((judgement) => judgement.matches).length;

  if (decision.refusal || !decision.matched?.id) {
    await deps.recordEvent({
      resolved: false,
      reason: decision.refusal ?? "no_match",
      replyId: null,
      publishedAt: null,
      examined: candidates.length,
      matched: matchedCount,
    });
    return {
      ok: false,
      reason: decision.refusal ?? "no_match",
      httpStatus: 409,
      judgements: decision.judgements,
      posted: false,
    };
  }

  // The publish time comes from YouTube. If it were missing the candidate
  // would already have been rejected, so this is evidence, not a guess.
  const published = candidates.find((candidate) => candidate.id === decision.matched?.id)?.publishedAt as string;

  const wrote = await deps.markAccepted(row.id, decision.matched.id, published);
  if (!wrote) {
    await deps.recordEvent({
      resolved: false,
      reason: "not_stuck",
      replyId: decision.matched.id,
      publishedAt: published,
      examined: candidates.length,
      matched: matchedCount,
    });
    return { ok: false, reason: "not_stuck", httpStatus: 409, judgements: decision.judgements, posted: false };
  }

  await deps.recordEvent({
    resolved: true,
    reason: null,
    replyId: decision.matched.id,
    publishedAt: published,
    examined: candidates.length,
    matched: matchedCount,
  });

  return { ok: true, status: "API_ACCEPTED", postedReplyId: decision.matched.id, apiAcceptedAt: published };
}

export const RECOVERY_RESOLVE_REFUSAL_TEXT: Record<string, string> = {
  not_stuck: "Only an attempt stuck mid-send can be resolved",
  already_posted: "This attempt already has a reply id",
  channel_mismatch: "These credentials do not belong to the expected channel",
  api_error: "YouTube could not be reached — nothing was changed",
  malformed_response: "YouTube's response could not be read — nothing was changed",
  no_match: "No reply matching the approved draft was found — this needs a human",
  listing_incomplete:
    "The replies under that comment could not all be read, so nothing can be concluded",
  multiple_matches: "More than one reply matched — this needs a human",
  no_attempt_time: "This attempt has no recorded claim time to check against",
};
