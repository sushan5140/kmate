import "server-only";

/**
 * Google OAuth for the KMate YouTube channel.
 *
 * Storage decision (Phase 1, option A): the long-lived refresh token is a
 * server-only Vercel environment variable, not a database row. A refresh
 * token in Supabase would be readable by anything holding the service-role
 * key, and protecting it properly would need an encryption key -- which is an
 * environment variable anyway. So the DB adds surface without adding safety.
 *
 * Nothing here is ever returned to a client or written to a log. Access
 * tokens are held in module memory only, for the life of the process, and the
 * refresh token is read but never echoed -- not into an error message, not
 * into an event's metadata, not into a response body.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Refresh slightly early, so a token cannot expire mid-request. */
const EXPIRY_SKEW_MS = 60_000;

export class YoutubeAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "YoutubeAuthError";
  }
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

function readConfig(): OAuthConfig {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  // Names only. The message reaches an admin UI, so it says which variable is
  // absent and never anything about the values of the ones that are present.
  const missing = [
    !clientId && "YOUTUBE_CLIENT_ID",
    !clientSecret && "YOUTUBE_CLIENT_SECRET",
    !refreshToken && "YOUTUBE_REFRESH_TOKEN",
  ].filter(Boolean);

  if (missing.length) {
    throw new YoutubeAuthError(
      "not_configured",
      `YouTube OAuth is not configured. Missing: ${missing.join(", ")}.`
    );
  }

  return { clientId: clientId!, clientSecret: clientSecret!, refreshToken: refreshToken! };
}

/**
 * True when every variable posting needs exists, without validating them.
 *
 * Includes YOUTUBE_CHANNEL_ID because assertExpectedChannel() now refuses to
 * post without it -- so an environment missing it is not configured for
 * posting, and the admin page should say so rather than fail at the click.
 */
export function isYoutubeConfigured(): boolean {
  return Boolean(
    process.env.YOUTUBE_CLIENT_ID &&
      process.env.YOUTUBE_CLIENT_SECRET &&
      process.env.YOUTUBE_REFRESH_TOKEN &&
      process.env.YOUTUBE_CHANNEL_ID
  );
}

/**
 * A valid access token, exchanged on demand and cached until just before it
 * expires. Google's refresh grant returns a token that lives about an hour,
 * so a burst of admin actions costs one exchange, not one per click.
 */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + EXPIRY_SKEW_MS) {
    return cached.accessToken;
  }

  const config = readConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });

  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
  } catch {
    throw new YoutubeAuthError("network", "Could not reach Google's token endpoint.");
  }

  if (!response.ok) {
    // Google's error body can echo request parameters. Read the short error
    // code only, and never the description or the body itself.
    let code = "unknown";
    try {
      const parsed = (await response.json()) as { error?: unknown };
      if (typeof parsed.error === "string") code = parsed.error;
    } catch {
      // A non-JSON body tells us nothing safe to surface.
    }
    cached = null;
    throw new YoutubeAuthError(
      "refresh_failed",
      `Google refused the refresh token (${code}). It may have been revoked or expired; ` +
        "re-authorise the channel and update YOUTUBE_REFRESH_TOKEN."
    );
  }

  const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new YoutubeAuthError("refresh_failed", "Google's token response contained no access token.");
  }

  const expiresInSeconds = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  cached = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
  return cached.accessToken;
}

/** Drops the cached access token. Used after a 401 so the next call re-exchanges. */
export function clearAccessTokenCache(): void {
  cached = null;
}
