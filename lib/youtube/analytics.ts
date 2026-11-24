import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  addDays,
  dayRange,
  recentDays,
  zonedDayString,
  type DayRange,
  type DayString,
} from "./day-window";
import { PROMOTION_CATEGORIES, type PromotionCategory } from "./classify";
import { computeSurvival, type Survival } from "./metrics";

/**
 * Daily and historical figures, derived from timestamps.
 *
 * No aggregate tables, no nightly rollup, no per-day copies of rows. Every
 * number here is a range scan over one indexed timestamp column, which keeps
 * the numbers correct by construction: a row edited or verified later shows up
 * in the right day automatically, because the day was never baked in.
 *
 * If these ever become expensive they can be materialised behind the same
 * function signatures. At the volumes this feature is capped to -- a handful
 * of replies a day -- counting on read is far cheaper than maintaining a
 * second copy of the truth.
 */

/** A head-only count over the queue table. */
function baseCountQuery() {
  return getSupabaseAdmin()
    .from("youtube_reply_queue")
    .select("id", { count: "exact", head: true });
}

// Derived from a real call rather than hand-written, so the filter callbacks
// below stay in step with the client's builder type.
type CountQuery = ReturnType<typeof baseCountQuery>;

/** One count query, scoped to a UTC range on one column. */
async function countInRange(
  column: string,
  range: DayRange | null,
  extra?: (q: CountQuery) => CountQuery
): Promise<number> {
  let query: CountQuery = baseCountQuery();

  if (range) {
    // Half-open [start, end): a row exactly on the boundary belongs to the
    // later day only, so consecutive days never double-count it.
    query = query.gte(column, range.startUtc.toISOString()).lt(column, range.endUtc.toISOString());
  } else {
    query = query.not(column, "is", null);
  }

  if (extra) query = extra(query);
  const { count } = await query;
  return count ?? 0;
}

export interface DailySummary {
  day: DayString;
  discovered: number;
  approved: number;
  /** Replies sent to YouTube -- accepted, not confirmed. */
  posted: number;
  apiAccepted: number;
  verifiedLive: number;
  removed: number;
  hold: number;
  skip: number;
  /** Still-open work discovered that day, whatever day it is now. */
  pending: number;
  /** Rows carried in from an earlier day and still open. */
  carriedIn: number;
  byVoice: { kmate: number; general: number };
  byOpportunity: { gks: number; general: number };
  byPromotion: Record<PromotionCategory, number>;
}

/**
 * Everything the Today strip and each archive card shows, for one local day.
 *
 * Each figure is anchored to the timestamp that actually records that event:
 * discovered_at for discovery, decided_at for approve/hold/skip,
 * api_accepted_at for sends, verified_at for confirmations,
 * removed_detected_at for removals. Anchoring "posted today" to anything but
 * api_accepted_at is how a dashboard starts lying.
 */
export async function dailySummary(day: DayString, timeZone: string): Promise<DailySummary> {
  const range = dayRange(day, timeZone);
  const from = range.startUtc.toISOString();
  const to = range.endUtc.toISOString();

  const [
    discovered,
    approved,
    posted,
    verifiedLive,
    removed,
    hold,
    skip,
    pending,
    carriedIn,
    apiAccepted,
    kmate,
    general,
    gks,
    generalOpp,
  ] = await Promise.all([
    countInRange("discovered_at", range),
    countInRange("decided_at", range, (q) => q.eq("status", "APPROVED")),
    countInRange("api_accepted_at", range),
    countInRange("verified_at", range, (q) => q.eq("status", "VERIFIED_LIVE")),
    countInRange("removed_detected_at", range),
    countInRange("decided_at", range, (q) => q.eq("status", "HOLD")),
    countInRange("decided_at", range, (q) => q.eq("status", "SKIP")),
    countInRange("discovered_at", range, (q) =>
      q.in("status", ["SCRAPED", "DRAFTED", "APPROVED", "FAILED"])
    ),
    // Discovered before this day and still open -- what carries forward INTO
    // it. Counted, never copied.
    (async () => {
      const { count } = await getSupabaseAdmin()
        .from("youtube_reply_queue")
        .select("id", { count: "exact", head: true })
        .lt("discovered_at", from)
        .in("status", ["SCRAPED", "DRAFTED", "APPROVED", "FAILED"])
        .eq("manual_follow_up", false);
      return count ?? 0;
    })(),
    // Sent that day and STILL unconfirmed. Deliberately separate from
    // "posted": it is the backlog awaiting verification, not a success.
    (async () => {
      const { count } = await getSupabaseAdmin()
        .from("youtube_reply_queue")
        .select("id", { count: "exact", head: true })
        .gte("api_accepted_at", from)
        .lt("api_accepted_at", to)
        .eq("status", "API_ACCEPTED");
      return count ?? 0;
    })(),
    countInRange("api_accepted_at", range, (q) => q.eq("best_choice", "KMate")),
    countInRange("api_accepted_at", range, (q) => q.neq("best_choice", "KMate")),
    countInRange("discovered_at", range, (q) => q.eq("opportunity_type", "GKS")),
    countInRange("discovered_at", range, (q) => q.eq("opportunity_type", "GENERAL")),
  ]);

  const promotionCounts = await Promise.all(
    PROMOTION_CATEGORIES.map(async (category) => {
      const n = await countInRange("api_accepted_at", range, (q) =>
        q.eq("promotion_category", category)
      );
      return [category, n] as const;
    })
  );

  const byPromotion = Object.fromEntries(promotionCounts) as Record<PromotionCategory, number>;

  return {
    day,
    discovered,
    approved,
    posted,
    apiAccepted,
    verifiedLive,
    removed,
    hold,
    skip,
    pending,
    carriedIn,
    byVoice: { kmate, general },
    byOpportunity: { gks, general: generalOpp },
    byPromotion,
  };
}

/** Compact cards for the Previous Days archive. */
export async function dailyArchive(
  endDay: DayString,
  count: number,
  timeZone: string
): Promise<DailySummary[]> {
  // endDay is today; the archive starts the day before it.
  const days = recentDays(addDays(endDay, -1), count);
  return Promise.all(days.map((day) => dailySummary(day, timeZone)));
}

// ---------------------------------------------------------------------------
// Survival
// ---------------------------------------------------------------------------

export type SurvivalStat = Survival;

const EMPTY_SURVIVAL: SurvivalStat = { checked: 0, live: 0, awaitingCheck: 0, rate: null };

/**
 * The 24-hour survival rate -- the metric that would have caught the previous
 * bulk run.
 *
 * The denominator is deliberately narrow: only replies that have actually been
 * CHECKED after the verification window, meaning VERIFIED_LIVE or REMOVED.
 *
 *   - API_ACCEPTED never counts as survived. YouTube accepting a reply says
 *     nothing about whether it is still there; treating acceptance as success
 *     is precisely the error that made 120 removed replies look like 120
 *     successes.
 *   - API_ACCEPTED never counts as removed either. An unchecked reply is
 *     unknown, not dead, and inferring removal before the check would invent
 *     the failure just as badly as the old bot invented the success.
 *
 * Unchecked replies are reported separately as `awaitingCheck`, so the rate is
 * always read next to how much of the day it does not yet cover.
 */
export async function survivalStat(
  range: DayRange | null,
  extra?: { voice?: "KMate" | "General"; promotion?: PromotionCategory }
): Promise<SurvivalStat> {
  const admin = getSupabaseAdmin();

  const scoped = () => {
    let q = admin.from("youtube_reply_queue").select("id", { count: "exact", head: true });
    if (range) {
      q = q
        .gte("api_accepted_at", range.startUtc.toISOString())
        .lt("api_accepted_at", range.endUtc.toISOString());
    } else {
      q = q.not("api_accepted_at", "is", null);
    }
    if (extra?.voice === "KMate") q = q.eq("best_choice", "KMate");
    if (extra?.voice === "General") q = q.neq("best_choice", "KMate");
    if (extra?.promotion) q = q.eq("promotion_category", extra.promotion);
    return q;
  };

  const [liveResult, removedResult, awaitingResult] = await Promise.all([
    scoped().eq("status", "VERIFIED_LIVE"),
    scoped().eq("status", "REMOVED"),
    scoped().eq("status", "API_ACCEPTED"),
  ]);

  // The ratio itself is computed by the pure rule in metrics.ts, so the
  // definition that matters is tested directly rather than through a query.
  return computeSurvival({
    live: liveResult.count ?? 0,
    removed: removedResult.count ?? 0,
    awaitingCheck: awaitingResult.count ?? 0,
  });
}

export interface SurvivalBreakdown {
  overall: SurvivalStat;
  byVoice: { kmate: SurvivalStat; general: SurvivalStat };
  byPromotion: Record<PromotionCategory, SurvivalStat>;
}

export async function survivalBreakdown(range: DayRange | null): Promise<SurvivalBreakdown> {
  const [overall, kmate, general, ...promotions] = await Promise.all([
    survivalStat(range),
    survivalStat(range, { voice: "KMate" }),
    survivalStat(range, { voice: "General" }),
    ...PROMOTION_CATEGORIES.map((promotion) => survivalStat(range, { promotion })),
  ]);

  const byPromotion = Object.fromEntries(
    PROMOTION_CATEGORIES.map((c, i) => [c, promotions[i] ?? EMPTY_SURVIVAL])
  ) as Record<PromotionCategory, SurvivalStat>;

  return { overall, byVoice: { kmate, general }, byPromotion };
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export interface ChannelStat {
  channel: string;
  opportunities: number;
  posted: number;
  verifiedLive: number;
  removed: number;
  /** verifiedLive / (verifiedLive + removed), or null when nothing is checked. */
  survivalRate: number | null;
}

/**
 * Per-channel outcomes, computed in one pass over a projection of the table.
 *
 * Kept deliberately small -- four numbers per channel, no time series, no
 * charts. It answers "which creators' audiences are our replies surviving
 * with", which is the only channel question worth acting on today.
 */
export async function channelStats(limit = 15): Promise<ChannelStat[]> {
  const { data } = await getSupabaseAdmin()
    .from("youtube_reply_queue")
    .select("channel_title, status, api_accepted_at")
    .not("channel_title", "is", null)
    .limit(5000);

  const byChannel = new Map<string, ChannelStat>();

  for (const row of (data ?? []) as {
    channel_title: string;
    status: string;
    api_accepted_at: string | null;
  }[]) {
    const key = row.channel_title;
    const stat =
      byChannel.get(key) ??
      { channel: key, opportunities: 0, posted: 0, verifiedLive: 0, removed: 0, survivalRate: null };

    stat.opportunities++;
    if (row.api_accepted_at) stat.posted++;
    if (row.status === "VERIFIED_LIVE") stat.verifiedLive++;
    if (row.status === "REMOVED") stat.removed++;
    byChannel.set(key, stat);
  }

  for (const stat of byChannel.values()) {
    const checked = stat.verifiedLive + stat.removed;
    stat.survivalRate = checked > 0 ? stat.verifiedLive / checked : null;
  }

  return [...byChannel.values()]
    .sort((a, b) => b.opportunities - a.opportunities)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Duplicate commenter warning
// ---------------------------------------------------------------------------

export interface AuthorHistory {
  author: string;
  /** Replies already sent to this author, excluding the row being viewed. */
  previousInteractions: number;
  /** When we last replied to them. */
  lastRepliedAt: string | null;
}

/**
 * How often this author has already heard from KMate.
 *
 * A WARNING ONLY, and it must stay one. It never blocks a post and it is not
 * consulted by any safety predicate. The authoritative duplicate protection is
 * the global unique constraint on youtube_comment_id, which is enforced by the
 * database; this is a courtesy signal so an admin does not reply to the same
 * person four times in a week without noticing.
 *
 * Author names are not stable identities on YouTube -- display names repeat
 * and change -- which is exactly why this informs rather than decides.
 */
export async function authorHistories(
  authors: string[]
): Promise<Map<string, AuthorHistory>> {
  const unique = [...new Set(authors.filter(Boolean))];
  const result = new Map<string, AuthorHistory>();
  if (unique.length === 0) return result;

  const { data } = await getSupabaseAdmin()
    .from("youtube_reply_queue")
    .select("author_name, api_accepted_at")
    .in("author_name", unique.slice(0, 200))
    .not("api_accepted_at", "is", null);

  for (const row of (data ?? []) as { author_name: string; api_accepted_at: string }[]) {
    const existing =
      result.get(row.author_name) ??
      { author: row.author_name, previousInteractions: 0, lastRepliedAt: null };
    existing.previousInteractions++;
    if (!existing.lastRepliedAt || row.api_accepted_at > existing.lastRepliedAt) {
      existing.lastRepliedAt = row.api_accepted_at;
    }
    result.set(row.author_name, existing);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Daily notes
// ---------------------------------------------------------------------------

export interface DailyNote {
  day: DayString;
  note: string;
  updated_at: string;
}

export async function getDailyNote(day: DayString): Promise<DailyNote | null> {
  const { data } = await getSupabaseAdmin()
    .from("youtube_daily_notes")
    .select("day, note, updated_at")
    .eq("day", day)
    .maybeSingle();

  return (data as DailyNote | null) ?? null;
}

/**
 * Saves the admin's note for one day.
 *
 * Informational only. Nothing in the posting path reads this table -- a note
 * saying "keep links off today" is a reminder to the person, not a rule the
 * server enforces, and pretending otherwise would be worse than not having it.
 */
export async function saveDailyNote(
  day: DayString,
  note: string,
  userId: string
): Promise<boolean> {
  const trimmed = note.trim();

  if (!trimmed) {
    const { error } = await getSupabaseAdmin().from("youtube_daily_notes").delete().eq("day", day);
    return !error;
  }

  const { error } = await getSupabaseAdmin()
    .from("youtube_daily_notes")
    .upsert(
      { day, note: trimmed.slice(0, 2000), created_by: userId, updated_at: new Date().toISOString() },
      { onConflict: "day" }
    );

  return !error;
}

/** Notes for a set of days, for the archive cards. */
export async function getNotes(days: DayString[]): Promise<Map<DayString, string>> {
  const { data } = await getSupabaseAdmin()
    .from("youtube_daily_notes")
    .select("day, note")
    .in("day", days);

  return new Map((data ?? []).map((r: { day: string; note: string }) => [r.day, r.note]));
}

/** Distinct channels present in the queue, for the filter dropdown. */
export async function listChannels(): Promise<string[]> {
  const { data } = await getSupabaseAdmin()
    .from("youtube_reply_queue")
    .select("channel_title")
    .not("channel_title", "is", null)
    .limit(5000);

  const set = new Set((data ?? []).map((r: { channel_title: string }) => r.channel_title));
  return [...set].sort();
}

/** Convenience for callers that only have a Date. */
export function dayOf(instant: Date, timeZone: string): DayString {
  return zonedDayString(instant, timeZone);
}
