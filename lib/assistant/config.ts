/**
 * Assistant rollout configuration.
 *
 * Two modes, and the safe one is the default. Nothing here reads a secret;
 * these are behaviour switches, deliberately separate from credentials.
 *
 *   suggest-only (default)  the assistant runs and records proposals, but
 *                           never writes a verified deadline. Everything
 *                           lands in needs_review for a person.
 *
 *   strict-auto             the assistant may mark a proposal auto_verified,
 *                           and only when EVERY gate condition passes.
 *
 * The default is suggest-only precisely because an unset or misspelled
 * environment variable must not silently enable automatic writes. Only the
 * exact string "true" turns it on.
 */

export type AssistantMode = "suggest-only" | "strict-auto";

/** Reads the flag fresh each call so a redeploy is not needed to flip it. */
export function autoVerifyEnabled(): boolean {
  return process.env.AUTO_VERIFY_ENABLED === "true";
}

export function assistantMode(): AssistantMode {
  return autoVerifyEnabled() ? "strict-auto" : "suggest-only";
}

/**
 * The confidence a proposal must reach before auto-verification is even
 * considered. Set high on purpose: the gate is meant to catch the handful of
 * unambiguous cases, not most of them. Everything else is a person's call.
 */
export const AUTO_VERIFY_MIN_CONFIDENCE = 0.98;
