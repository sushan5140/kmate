/**
 * The one place that decides what a `next=` redirect target may be.
 *
 * Three separate places used to answer this question and none agreed:
 * proxy.ts wrote a bare pathname, /login accepted anything starting with "/",
 * and /auth/callback validated nothing at all. That inconsistency is what let
 * a query string get dropped on the way to /login -- and what left
 * `next=//evil.com` acceptable to a check that only asked `startsWith("/")`,
 * because a protocol-relative URL starts with a slash too and a browser reads
 * it as a different origin.
 *
 * Everything that produces or consumes `next` now goes through this module.
 */

/** Where an unresolvable or unsafe `next` lands. */
export const DEFAULT_NEXT = "/home";

/**
 * True only for a path that stays on this origin.
 *
 * The rules, all of which must hold:
 *   - begins with exactly one "/" -- "//evil.com" and "/\evil.com" are
 *     protocol-relative or scheme-confused and go elsewhere
 *   - contains no backslash anywhere -- URL parsers in the special-scheme
 *     path treat "\" as "/", so "/\/evil.com" is another spelling of "//"
 *   - has no scheme -- "javascript:", "data:", "https:" and friends
 *   - contains no control characters, which can be used to smuggle a newline
 *     or NUL past a naive check
 *
 * The value is examined as given. It is deliberately NOT decoded first:
 * decoding then re-testing is how "%2f%2fevil.com" style bypasses are born,
 * because the string that gets tested stops being the string that gets used.
 */
export function isSafeNext(value: string | null | undefined): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.length > 2048) return false;

  // Must be origin-relative, and one slash only.
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;

  // Backslashes are normalised to "/" by URL parsers, so "/\evil.com" would
  // otherwise pass the single-slash test above and still leave the origin.
  if (value.includes("\\")) return false;

  // Control characters (including \n, \r, \t and NUL) never belong in a path
  // and are a standard way to split or truncate a header/URL.
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;

  // A scheme before the first "/" is impossible given the startsWith check,
  // but a scheme can still appear as "/javascript:alert(1)" in some sinks.
  // Reject any colon in the first path segment, which no real route uses.
  const firstSegment = value.slice(1).split(/[/?#]/, 1)[0];
  if (firstSegment.includes(":")) return false;

  // Final authority: resolve against a throwaway origin and confirm the result
  // did not escape it. This catches anything the explicit rules above missed.
  try {
    const probe = new URL(value, "https://kmate.invalid");
    if (probe.origin !== "https://kmate.invalid") return false;
  } catch {
    return false;
  }

  return true;
}

/** The value if it is a safe internal destination, otherwise DEFAULT_NEXT. */
export function sanitizeNext(value: string | null | undefined): string {
  return isSafeNext(value) ? value : DEFAULT_NEXT;
}

/**
 * The full internal destination for a request: pathname plus its query string
 * (and hash, when a caller has one -- a server request never does, since the
 * browser keeps the fragment to itself).
 *
 * This is the piece the old code was missing. proxy.ts wrote
 * `request.nextUrl.pathname` and nothing else, so /notices?view=gks&... became
 * plain /notices and every filter was lost on the way back.
 */
export function destinationFrom(url: { pathname: string; search?: string; hash?: string }): string {
  return `${url.pathname}${url.search ?? ""}${url.hash ?? ""}`;
}

/**
 * Builds `/login?next=<destination>` with the destination percent-encoded once.
 *
 * Encoding matters here: the destination contains "?" and "&" of its own, and
 * without encoding those would parse as extra parameters of the LOGIN url
 * rather than as part of the value. That is exactly what production showed --
 * `/login?view=gks&program=GKS-U&track=embassy&next=%2Fnotices`, with the
 * filters stranded as siblings of `next` instead of inside it.
 */
export function buildLoginUrl(destination: string, basePath = "/login"): string {
  const safe = sanitizeNext(destination);
  return `${basePath}?next=${encodeURIComponent(safe)}`;
}

/**
 * Carries the destination onward to another gated step (currently /onboarding)
 * so a user who has to finish setting up still lands where they were going.
 * Returns the bare path when the destination is just the default, keeping URLs
 * clean for the common case.
 */
export function withNext(path: string, destination: string | null | undefined): string {
  if (!isSafeNext(destination) || destination === DEFAULT_NEXT) return path;
  return `${path}?next=${encodeURIComponent(destination)}`;
}
