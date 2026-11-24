import "server-only";
import { getAccessToken, clearAccessTokenCache, YoutubeAuthError } from "./oauth";

/**
 * The two YouTube Data API v3 calls this feature makes, and nothing else.
 *
 * Plain fetch rather than the googleapis package: that dependency is ~20MB
 * and carries a discovery layer for hundreds of endpoints we never touch.
 * Two REST calls do not justify it.
 *
 *   comments.insert  -- create one reply under one top-level comment
 *   comments.list    -- does this exact reply id still exist?
 *
 * The list call is the one that matters. Querying the exact id YouTube
 * returned is how the previous bulk run was finally audited honestly: an
 * empty `items` array means the reply is gone, whatever the insert reported
 * at the time.
 */

const API_BASE = "https://www.googleapis.com/youtube/v3";

export class YoutubeApiError extends Error {
  readonly code: string;
  readonly httpStatus: number | null;
  /** True when we cannot tell whether the write took effect. */
  readonly outcomeUnknown: boolean;

  constructor(
    code: string,
    message: string,
    options: { httpStatus?: number | null; outcomeUnknown?: boolean } = {}
  ) {
    super(message);
    this.code = code;
    this.name = "YoutubeApiError";
    this.httpStatus = options.httpStatus ?? null;
    this.outcomeUnknown = options.outcomeUnknown ?? false;
  }
}

/** Google's structured error shape, reduced to the parts safe to store. */
async function readApiError(response: Response): Promise<{ reason: string; message: string }> {
  try {
    const parsed = (await response.json()) as {
      error?: { message?: unknown; errors?: Array<{ reason?: unknown }> };
    };
    const reason = parsed.error?.errors?.[0]?.reason;
    const message = parsed.error?.message;
    return {
      reason: typeof reason === "string" ? reason : `http_${response.status}`,
      // Google's message describes the API-level problem (quota, permission,
      // a comment that no longer exists). It contains no credential material,
      // and it is the only useful thing to show an admin.
      message: typeof message === "string" ? message : `HTTP ${response.status}`,
    };
  } catch {
    return { reason: `http_${response.status}`, message: `HTTP ${response.status}` };
  }
}

async function authedFetch(url: string, init: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
}

export interface InsertedReply {
  replyId: string;
}

/**
 * Posts one reply under one top-level comment.
 *
 * `parentId` is always a stored `youtube_comment_id` read from an approved
 * queue row -- never a value from a request body. The caller has already
 * claimed the row, so this is the only side-effecting call in the feature.
 *
 * A network failure here is reported with outcomeUnknown, because a request
 * that dies in flight may still have created the reply. The caller must not
 * treat that as "did not post".
 */
export async function insertReply(parentId: string, text: string): Promise<InsertedReply> {
  const url = `${API_BASE}/comments?part=snippet`;

  let response: Response;
  try {
    response = await authedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snippet: { parentId, textOriginal: text } }),
    });
  } catch (error) {
    if (error instanceof YoutubeAuthError) throw error;
    throw new YoutubeApiError(
      "network",
      "The request to YouTube failed before a response was received. It is not known whether the reply was created.",
      { outcomeUnknown: true }
    );
  }

  if (response.status === 401) clearAccessTokenCache();

  if (!response.ok) {
    const { reason, message } = await readApiError(response);
    throw new YoutubeApiError(reason, message, { httpStatus: response.status });
  }

  const payload = (await response.json()) as { id?: unknown };
  if (typeof payload.id !== "string" || !payload.id) {
    // Accepted, but we have no id to verify against later -- which makes the
    // reply unauditable. Treated as unknown, not as success.
    throw new YoutubeApiError("no_reply_id", "YouTube accepted the reply but returned no id.", {
      httpStatus: response.status,
      outcomeUnknown: true,
    });
  }

  return { replyId: payload.id };
}

export interface ReplyExistence {
  found: boolean;
}

/**
 * Does this exact reply id still exist?
 *
 * Read-only. An empty `items` array is the answer "no", not an error --
 * that is precisely the signal the post-hoc audit of the old bot relied on,
 * and it is how a removed reply is detected.
 */
export async function replyExists(replyId: string): Promise<ReplyExistence> {
  const url = `${API_BASE}/comments?part=snippet&textFormat=plainText&id=${encodeURIComponent(replyId)}`;

  let response: Response;
  try {
    response = await authedFetch(url, { method: "GET" });
  } catch (error) {
    if (error instanceof YoutubeAuthError) throw error;
    throw new YoutubeApiError("network", "Could not reach YouTube to check the reply.");
  }

  if (response.status === 401) clearAccessTokenCache();

  // A deleted comment id can come back as 404 rather than an empty list.
  if (response.status === 404) return { found: false };

  if (!response.ok) {
    const { reason, message } = await readApiError(response);
    throw new YoutubeApiError(reason, message, { httpStatus: response.status });
  }

  const payload = (await response.json()) as { items?: unknown };
  const items = Array.isArray(payload.items) ? payload.items : [];
  return { found: items.length > 0 };
}

/**
 * Confirms the credentials belong to the channel we expect.
 *
 * Guards against a swapped or mistakenly re-issued refresh token posting as
 * the wrong account -- a mistake that is invisible until replies appear under
 * someone else's name.
 *
 * Fails CLOSED when YOUTUBE_CHANNEL_ID is unset. An unset variable is not
 * "no opinion about the channel", it is "no way to tell which channel these
 * credentials own", and posting anyway would publish under an unverified
 * account. A misconfigured environment must refuse to post, exactly as
 * isAuthorizedAdmin refuses everyone when ADMIN_EMAIL is missing.
 */
export async function assertExpectedChannel(): Promise<void> {
  const expected = process.env.YOUTUBE_CHANNEL_ID?.trim();
  if (!expected) {
    throw new YoutubeApiError(
      "channel_not_configured",
      "YOUTUBE_CHANNEL_ID is not set, so there is no way to confirm these credentials belong to the KMate channel. Refusing to post."
    );
  }

  let response: Response;
  try {
    response = await authedFetch(`${API_BASE}/channels?part=id&mine=true`, { method: "GET" });
  } catch (error) {
    if (error instanceof YoutubeAuthError) throw error;
    throw new YoutubeApiError("network", "Could not reach YouTube to confirm the channel.");
  }

  if (!response.ok) {
    const { reason, message } = await readApiError(response);
    throw new YoutubeApiError(reason, message, { httpStatus: response.status });
  }

  const payload = (await response.json()) as { items?: Array<{ id?: unknown }> };
  const actual = payload.items?.[0]?.id;
  if (typeof actual !== "string" || actual !== expected) {
    throw new YoutubeApiError(
      "channel_mismatch",
      "The configured credentials do not belong to YOUTUBE_CHANNEL_ID. Refusing to post."
    );
  }
}

// ---------------------------------------------------------------------------
// Read-only helpers for the recovery send path
// ---------------------------------------------------------------------------

/**
 * The authenticated channel's id and title, unjudged.
 *
 * `assertExpectedChannel` above answers "does this match YOUTUBE_CHANNEL_ID".
 * The recovery path needs the raw identity instead, because it asserts against
 * the channel pinned in code (recovery-verify.EXPECTED_CHANNEL_ID) rather than
 * against an environment variable that could be pointed anywhere.
 */
export async function fetchAuthenticatedChannel(): Promise<{ id: string | null; title: string | null }> {
  let response: Response;
  try {
    response = await authedFetch(`${API_BASE}/channels?part=id,snippet&mine=true`, { method: "GET" });
  } catch (error) {
    if (error instanceof YoutubeAuthError) throw error;
    throw new YoutubeApiError("network", "Could not reach YouTube to confirm the channel.");
  }

  if (response.status === 401) clearAccessTokenCache();
  if (!response.ok) {
    const { reason, message } = await readApiError(response);
    throw new YoutubeApiError(reason, message, { httpStatus: response.status });
  }

  const payload = (await response.json()) as {
    items?: Array<{ id?: unknown; snippet?: { title?: unknown } }>;
  };
  const item = payload.items?.[0];
  return {
    id: typeof item?.id === "string" ? item.id : null,
    title: typeof item?.snippet?.title === "string" ? item.snippet.title : null,
  };
}

/**
 * One exact-id comments.list, returned UNINTERPRETED for the caller to classify.
 *
 * Deliberately not `replyExists`. That helper reads a 404 as "gone", which is
 * the right call for verifying a reply we ourselves just created and hold the
 * id for. It is the wrong call before a recovery send: there, "gone" is the
 * permission to post, and a 404 is far more likely a malformed request than a
 * deleted comment. So this returns the raw status and body, and
 * recovery-verify.classifyLookup applies the strict rule -- only HTTP 200 with
 * an empty items ARRAY counts as removed.
 *
 * Never throws: a transport failure is a classification input, not an
 * exception, so one unreachable check cannot look like anything but "unknown".
 */
export async function fetchReplyLookup(
  replyId: string
): Promise<{ status: number; body: unknown; networkError?: string }> {
  const url = `${API_BASE}/comments?part=id,snippet&textFormat=plainText&id=${encodeURIComponent(replyId)}`;

  let response: Response;
  try {
    response = await authedFetch(url, { method: "GET" });
  } catch (error) {
    return {
      status: 0,
      body: null,
      networkError: error instanceof Error ? error.message : "unknown transport failure",
    };
  }

  if (response.status === 401) clearAccessTokenCache();

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

/**
 * ALL replies under one top-level comment, paginated. Read-only.
 *
 * Used only by the stuck-send resolver, which needs to find out whether a
 * reply it may have created actually exists. Returns a discriminated result
 * rather than throwing, so an API failure classifies as "we could not look"
 * instead of propagating as an exception the resolver might mistake for
 * "nothing found" -- the difference between those two is the whole point.
 *
 * Pagination matters for correctness, not completeness. A single page would
 * let a busy comment hide the matching reply past position 100, and the
 * resolver would read that as "no match" -- a wrong answer that looks like a
 * safe one. So every page is followed, and if the page cap is somehow reached
 * the result says `truncated` and the resolver refuses rather than concluding
 * anything from a partial list.
 */
const REPLY_PAGE_SIZE = 100;
const MAX_REPLY_PAGES = 20;

export async function fetchRepliesForParent(
  parentId: string
): Promise<
  | { ok: true; items: unknown[]; truncated: boolean; pages: number }
  | { ok: false; reason: "api_error" | "malformed_response" }
> {
  const collected: unknown[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const url =
      `${API_BASE}/comments?part=id,snippet&textFormat=plainText&maxResults=${REPLY_PAGE_SIZE}` +
      `&parentId=${encodeURIComponent(parentId)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

    let response: Response;
    try {
      response = await authedFetch(url, { method: "GET" });
    } catch {
      return { ok: false, reason: "api_error" };
    }

    if (response.status === 401) clearAccessTokenCache();
    if (!response.ok) return { ok: false, reason: "api_error" };

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, reason: "malformed_response" };
    }

    if (!payload || typeof payload !== "object") return { ok: false, reason: "malformed_response" };
    const body = payload as { items?: unknown; nextPageToken?: unknown };
    if (!Array.isArray(body.items)) return { ok: false, reason: "malformed_response" };

    collected.push(...body.items);
    pages++;
    pageToken = typeof body.nextPageToken === "string" ? body.nextPageToken : undefined;
  } while (pageToken && pages < MAX_REPLY_PAGES);

  // A token still outstanding at the cap means we did NOT see everything.
  return { ok: true, items: collected, truncated: Boolean(pageToken), pages };
}
