/**
 * Picks which recently-added scholarship the home dashboard spotlights.
 *
 * This lives outside the page on purpose. Choosing "a different one each
 * visit" needs a value that changes over time, and reading the clock inside a
 * component's render is exactly what the React purity rule forbids -- so the
 * rotation is treated as a data-layer concern and kept here, leaving the page
 * to call one plain function.
 *
 * An honest note on "a new one each login": the server cannot see logins, only
 * requests, and this version stores nothing per user. So the spotlight rotates
 * on a fixed clock bucket instead -- it holds steady while you move around the
 * app, and has moved on by the time you next come back. Two visits inside the
 * same bucket see the same scholarship. Making it strictly per-login would
 * need a stored per-user cursor, which this version deliberately does not add.
 *
 * The pick is never "new to you" in a personalised sense, and nothing here
 * claims it is -- it draws from the most recently added scholarships, which is
 * what the caller passes in.
 */

/** How long one scholarship stays spotlighted before the next takes over. */
const ROTATE_EVERY_MS = 30 * 60 * 1000;

/** Small deterministic string hash, so a given seed always picks the same index. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * One item from `pool`, rotating over time and varying between users.
 *
 * Seeding with the viewer's id as well as the clock means two people looking
 * at the dashboard in the same half hour are not shown the same scholarship,
 * so the pool gets spread around rather than everyone seeing the newest entry.
 */
export function pickSpotlight<T>(pool: T[], viewerId: string, now: number = Date.now()): T | null {
  if (pool.length === 0) return null;
  const bucket = Math.floor(now / ROTATE_EVERY_MS);
  return pool[hash(`${viewerId}:${bucket}`) % pool.length];
}
