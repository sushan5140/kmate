import "server-only";

/**
 * In-process sliding-window rate limiter. Deliberately simple for this
 * project's scale -- no Redis/external service. This only protects within a
 * single warm serverless instance: a cold start or a request routed to a
 * different instance resets the count for that instance. Accepted tradeoff
 * for "stop rapid-fire abuse from one client", not a guarantee against a
 * distributed attacker. Swap the Map below for a Supabase-backed counter (or
 * Upstash/Redis) later without changing call sites, if it ever matters.
 */
const hits = new Map<string, number[]>();

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, timestamps] of hits) {
    const kept = timestamps.filter((t) => now - t < windowMs);
    if (kept.length === 0) hits.delete(key);
    else hits.set(key, kept);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * @param key Unique identifier for the thing being limited, e.g. `connect:${userId}`.
 * @param limit Max requests allowed within the window.
 * @param windowMs Window size in milliseconds.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);

  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.ceil((windowMs - (now - oldest)) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return { allowed: true, retryAfterSeconds: 0 };
}
