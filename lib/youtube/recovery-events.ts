/**
 * The recovery audit vocabulary.
 *
 * Pure module: no `server-only`, no Supabase, no network. The writer lives in
 * recovery-post.ts; this file is only the shape, so the rules modules and the
 * regression suite can name events without importing a database client.
 *
 * The trail exists because the previous bot reported success for replies that
 * were never live. Status columns say where a row IS; these events say what
 * was actually attempted, what YouTube actually answered, and who authorized
 * it. A row that ends in an unknown state is only investigable if the attempt
 * that produced it was recorded at the time.
 */

export const RECOVERY_EVENT_TYPES = [
  "RECOVERY_SEND_REQUESTED",
  "RECOVERY_FRESH_VERIFICATION_PASSED",
  "RECOVERY_FRESH_VERIFICATION_BLOCKED",
  "RECOVERY_POST_CLAIMED",
  "RECOVERY_API_ACCEPTED",
  "RECOVERY_API_REJECTED",
  "RECOVERY_OUTCOME_UNKNOWN",
  "RECOVERY_STUCK_RESOLVED",
  "RECOVERY_STUCK_UNRESOLVED",
  "RECOVERY_RETRY_AUTHORIZED",
  "RECOVERY_VERIFY_FOUND",
  "RECOVERY_VERIFY_NOT_FOUND",
  "RECOVERY_VERIFY_INCONCLUSIVE",
] as const;

export type RecoveryEventType = (typeof RECOVERY_EVENT_TYPES)[number];

export interface RecoveryEventInput {
  attemptId: string;
  eventType: RecoveryEventType;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId?: string | null;
  youtubeReplyId?: string | null;
  attemptNumber?: number | null;
  metadata?: Record<string, unknown>;
}

/**
 * Keys that may appear in event metadata.
 *
 * An allow-list, not a deny-list. Metadata is the one free-form field in the
 * trail, and the failure it must not have is a token or a refresh secret
 * getting written into a table someone later exports. Naming what is allowed
 * means a new field has to be added here deliberately.
 */
export const ALLOWED_EVENT_METADATA_KEYS = [
  "parent_comment_id",
  "legacy_reply_id",
  "result",
  "reason",
  "detail",
  "disposition",
  "http_status",
  "candidates_examined",
  "candidates_matched",
  "channel_id",
  "published_at",
  "previous_attempt_count",
  "previous_error",
  "author_channel_id",
  "listing_truncated",
  "pages_fetched",
  "evidence",
] as const;

export class UnsafeEventMetadataError extends Error {
  constructor(keys: string[]) {
    super(`Refusing to record event metadata with unexpected keys: ${keys.join(", ")}`);
    this.name = "UnsafeEventMetadataError";
  }
}

/** Anything that looks like credential material, regardless of key name. */
const SECRET_SHAPED = /(ya29\.|^1\/\/0|-----BEGIN|refresh_token|client_secret|access_token|Bearer\s)/i;

/**
 * Filters metadata to the allow-list and refuses anything secret-shaped.
 *
 * Unknown keys throw rather than being dropped silently: a caller trying to
 * record something this function does not know about is a decision for a
 * person, not something to paper over at runtime.
 */
export function sanitiseEventMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set<string>(ALLOWED_EVENT_METADATA_KEYS);
  const unknown = Object.keys(metadata).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new UnsafeEventMetadataError(unknown);

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string" && SECRET_SHAPED.test(value)) {
      throw new UnsafeEventMetadataError([`${key} (value looks like credential material)`]);
    }
  }
  return { ...metadata };
}
