/**
 * Manual post-acceptance verification: did the reply we sent actually survive?
 *
 * Pure module: no `server-only`, no Supabase, no network. I/O injected.
 *
 * This closes the loop the whole feature was built around. API_ACCEPTED means
 * YouTube's API returned an id -- it does NOT mean the reply is live, and the
 * previous bot's entire false success report came from treating those as the
 * same thing. The only way to know is to ask for that exact reply id later and
 * see whether it comes back.
 *
 * Three outcomes, and the asymmetry is the point:
 *
 *   VERIFIED_LIVE -- the exact id came back, under our parent, authored by our
 *                    channel. Positive evidence, all three conditions.
 *   REMOVED       -- HTTP 200 with an empty items array. The reply is gone.
 *                    TERMINAL: nothing here or anywhere re-posts it.
 *   inconclusive  -- anything else. No status change at all.
 *
 * A 404 is inconclusive, not removal, for the same reason it is everywhere
 * else in this feature: comments.list answers an unknown id with 200/empty, so
 * a 404 is more likely a malformed request than a deleted comment, and the
 * cost of guessing wrong is a row marked REMOVED that was actually fine.
 */

import { EXPECTED_CHANNEL_ID, verifyChannel, type ChannelIdentity } from "./recovery-verify";

export const CONFIRM_FROM_STATUSES = ["API_ACCEPTED", "VERIFIED_LIVE"] as const;

export type ConfirmRefusal =
  | "not_confirmable"
  | "no_reply_id"
  | "channel_mismatch"
  | "api_error"
  | "inconclusive";

export interface ConfirmRow {
  id: string;
  status: string;
  youtube_comment_id: string;
  posted_reply_id: string | null;
}

export interface ConfirmLookup {
  status: number;
  body: unknown;
  networkError?: string;
}

export type ConfirmVerdict =
  | { result: "VERIFIED_LIVE"; detail: string }
  | { result: "REMOVED"; detail: string }
  | { result: "INCONCLUSIVE"; detail: string };

/**
 * Turns one exact-id lookup of OUR OWN posted reply into a verdict.
 *
 * Stricter than a bare existence check: the item that comes back must also be
 * under the expected parent and authored by the expected channel. An id that
 * resolves to someone else's comment is not our reply being live, it is our
 * id being wrong, and that deserves "inconclusive" rather than a green tick.
 */
export function classifyConfirmation(row: ConfirmRow, lookup: ConfirmLookup): ConfirmVerdict {
  if (lookup.networkError) {
    return { result: "INCONCLUSIVE", detail: `network: ${lookup.networkError}` };
  }
  if (lookup.status === 404) {
    return {
      result: "INCONCLUSIVE",
      detail: "http 404 — comments.list answers an unknown id with 200/empty, so this is not read as removal",
    };
  }
  if (lookup.status !== 200) {
    return { result: "INCONCLUSIVE", detail: `http ${lookup.status}` };
  }
  if (!lookup.body || typeof lookup.body !== "object") {
    return { result: "INCONCLUSIVE", detail: "200 with no parseable body" };
  }

  const items = (lookup.body as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return { result: "INCONCLUSIVE", detail: "200 but the body carried no items array" };
  }

  // The one observation that proves removal, and the same one the whole
  // feature has used from the start.
  if (items.length === 0) {
    return { result: "REMOVED", detail: "empty items — the reply is gone" };
  }
  if (items.length > 1) {
    return { result: "INCONCLUSIVE", detail: `exact-id lookup returned ${items.length} items` };
  }

  const item = items[0] as { id?: unknown; snippet?: unknown };
  const snippet = (item.snippet ?? {}) as { parentId?: unknown; authorChannelId?: unknown };
  const author = (snippet.authorChannelId ?? {}) as { value?: unknown };

  if (item.id !== row.posted_reply_id) {
    return { result: "INCONCLUSIVE", detail: "the returned id is not the one we asked for" };
  }
  if (snippet.parentId !== row.youtube_comment_id) {
    return { result: "INCONCLUSIVE", detail: "the reply is not under the expected parent comment" };
  }
  if (author.value !== EXPECTED_CHANNEL_ID) {
    return { result: "INCONCLUSIVE", detail: "the reply is not authored by the expected channel" };
  }

  return { result: "VERIFIED_LIVE", detail: "found, under the expected parent, authored by us" };
}

/** Stored state that permits a confirmation check. */
export function confirmRefusal(row: ConfirmRow): ConfirmRefusal | null {
  if (!(CONFIRM_FROM_STATUSES as readonly string[]).includes(row.status)) return "not_confirmable";
  if (!row.posted_reply_id) return "no_reply_id";
  return null;
}

export function canConfirmRecovery(row: ConfirmRow): boolean {
  return confirmRefusal(row) === null;
}

export type ConfirmOutcome =
  | { ok: true; status: "VERIFIED_LIVE" | "REMOVED"; detail: string; changed: boolean }
  | { ok: false; reason: ConfirmRefusal; detail: string; httpStatus: number };

export interface ConfirmDeps {
  loadRow(id: string): Promise<ConfirmRow | null>;
  authenticatedChannel(): Promise<ChannelIdentity>;
  lookupReply(replyId: string): Promise<ConfirmLookup>;
  /**
   * Records the verdict. Guarded on the row still being in the status the
   * check was made against. Returns whether it applied.
   */
  applyVerdict(
    id: string,
    fromStatus: string,
    verdict: "VERIFIED_LIVE" | "REMOVED"
  ): Promise<boolean>;
  recordEvent(input: {
    verdict: ConfirmVerdict;
    replyId: string;
    fromStatus: string;
  }): Promise<void>;
}

/**
 * Check one already-sent reply, read-only, and record what was found.
 *
 * Cannot post, cannot re-post, and cannot un-remove. A REMOVED verdict is
 * terminal by design: this feature exists because replies were removed once
 * already, and automatically replacing them is the behaviour it replaced.
 */
export async function executeConfirmation(deps: ConfirmDeps, id: string): Promise<ConfirmOutcome> {
  const row = await deps.loadRow(id);
  if (!row) return { ok: false, reason: "not_confirmable", detail: "no such attempt", httpStatus: 404 };

  const stored = confirmRefusal(row);
  if (stored) return { ok: false, reason: stored, detail: "stored state does not permit a check", httpStatus: 409 };

  const verdict = verifyChannel(await deps.authenticatedChannel());
  if (!verdict.ok) {
    return { ok: false, reason: "channel_mismatch", detail: "unexpected channel", httpStatus: 502 };
  }

  const replyId = row.posted_reply_id as string;
  const judgement = classifyConfirmation(row, await deps.lookupReply(replyId));
  await deps.recordEvent({ verdict: judgement, replyId, fromStatus: row.status });

  if (judgement.result === "INCONCLUSIVE") {
    // Deliberately no status change. Not knowing is not a state transition.
    return { ok: false, reason: "inconclusive", detail: judgement.detail, httpStatus: 503 };
  }

  const applied = await deps.applyVerdict(row.id, row.status, judgement.result);
  return { ok: true, status: judgement.result, detail: judgement.detail, changed: applied };
}

export const RECOVERY_CONFIRM_REFUSAL_TEXT: Record<string, string> = {
  not_confirmable: "Only a sent reply can be checked",
  no_reply_id: "This attempt has no reply id to check",
  channel_mismatch: "These credentials do not belong to the expected channel",
  api_error: "YouTube could not be reached — nothing was changed",
  inconclusive: "The check was inconclusive — nothing was changed",
};
