import type { QueueNoticeType } from "./review-schema";

/**
 * The applicant-facing shape of an approved GKS notice, plus the pure matching,
 * filtering and de-duplication rules that operate on it.
 *
 * Split from published.ts on purpose: that module is `server-only` because it
 * touches the service-role client, but Home's notice feed is a client
 * component and needs these rules at runtime. Same split as
 * review-schema.ts / review-queue.ts.
 *
 * Nothing here reads or exposes candidate dates. A published notice carries
 * no date but the notice's own publication date -- approving a notice never
 * makes any date a verified deadline.
 */

/** Programme of a PUBLISHED notice. "unknown" is deliberately not representable. */
export type PublishedProgram = "GKS-U" | "GKS-G";

/** null means the official notice names no single track -- it applies to both. */
export type PublishedTrack = "embassy" | "university" | null;

/**
 * Everything here is either an official fact from public.notices or a
 * human-approved classification from the review queue.
 *
 * Deliberately absent: reviewer id, reviewed_at, review_note, queue id, queue
 * status, and extracted_dates. None of those are an applicant's business, and
 * the last one is the thing that must never look like a deadline.
 */
export interface PublishedGksNotice {
  /** public.notices id -- the official notice, not the queue row. */
  id: string;
  title: string;
  sourceUrl: string;
  /** The board's own notice id, when the URL carries one. Used for dedupe. */
  sourceNoticeId: string | null;
  /** NULL when the official notice states no date. Never inferred. */
  publishedAt: string | null;
  /** Measured from the stored text, not claimed by the source. */
  language: string | null;
  /** Approved classification. Never inferred at read time. */
  program: PublishedProgram;
  track: PublishedTrack;
  noticeType: QueueNoticeType;
  publisher: string;
  /**
   * True for every published row -- it exists so a card can show a "Reviewed"
   * badge without knowing the query's where-clause. It says a human checked
   * the classification. It does NOT say any date in the notice is a verified
   * deadline.
   */
  reviewed: true;
}

// ---------------------------------------------------------------------------
// Pure matching / filtering. Kept separate from the query so it is testable
// without a database and reusable by both Home and /notices.
// ---------------------------------------------------------------------------

export interface NoticeFilter {
  program?: PublishedProgram | "all";
  track?: "embassy" | "university" | "all";
  noticeType?: QueueNoticeType | "all";
}

/**
 * Does this published notice apply to the given programme/track?
 *
 * Same semantics the deadline matcher already uses, deliberately: an exact
 * programme match, and a track that either matches or is null. A null track
 * means the official notice names no track, so it applies to BOTH -- it stays
 * visible whichever track is selected. It is never treated as "no track".
 */
export function noticeAppliesTo(
  notice: PublishedGksNotice,
  program: PublishedProgram,
  track?: "embassy" | "university" | null
): boolean {
  if (notice.program !== program) return false;
  return notice.track === null || !track || notice.track === track;
}

/** Applies the /notices filter set. "all" (or absent) means no constraint on that axis. */
export function filterPublishedNotices(
  notices: PublishedGksNotice[],
  filter: NoticeFilter
): PublishedGksNotice[] {
  return notices.filter((n) => {
    if (filter.program && filter.program !== "all" && n.program !== filter.program) return false;
    // Track null stays visible under either track selection -- see above.
    if (filter.track && filter.track !== "all" && n.track !== null && n.track !== filter.track) return false;
    if (filter.noticeType && filter.noticeType !== "all" && n.noticeType !== filter.noticeType) return false;
    return true;
  });
}

/** Newest first; a notice with no stated date sorts last rather than being dropped. */
export function sortNewestFirst(notices: PublishedGksNotice[]): PublishedGksNotice[] {
  return [...notices].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ---------------------------------------------------------------------------
// Static-vs-live deduplication
// ---------------------------------------------------------------------------

/** The minimum a curated static notice must expose to be de-duplicated against. */
export interface StaticNoticeKey {
  sourceUrl: string;
  sourceNoticeId?: string | null;
  title: string;
  publishedAt: string | null;
}

/** Trailing slashes, case and tracking-ish noise removed so two spellings of one URL collide. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    // Query order varies between how the board links a notice and how we
    // rebuilt it, so compare a sorted parameter list rather than the raw string.
    const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const qs = params.map(([k, v]) => `${k}=${v}`).join("&");
    return `${u.hostname.toLowerCase()}${path.toLowerCase()}${qs ? `?${qs}` : ""}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

const normTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

/** Last-resort identity when neither URL nor board id matches. */
export const titleDateIdentity = (title: string, publishedAt: string | null) =>
  `${normTitle(title)}|${publishedAt ?? ""}`;

/**
 * Removes live notices that the curated static dataset already covers.
 *
 * Strongest key first, exactly as specified: canonical source URL, then the
 * board's own notice id, then normalised title + publication date.
 *
 * Where both systems hold the same official notice the STATIC one wins and the
 * live copy is dropped entirely. That is what stops a disagreement in
 * classification from surfacing as two contradictory cards for one notice --
 * the manually verified record is authoritative, and the duplicate simply
 * does not appear. Nothing is merged: an incompatible pair is resolved by
 * dropping one side, never by blending their fields.
 */
export function dedupeAgainstStatic(
  live: PublishedGksNotice[],
  staticNotices: StaticNoticeKey[]
): PublishedGksNotice[] {
  const urls = new Set<string>();
  const boardIds = new Set<string>();
  const titleDates = new Set<string>();

  for (const s of staticNotices) {
    urls.add(canonicalUrl(s.sourceUrl));
    if (s.sourceNoticeId) boardIds.add(s.sourceNoticeId);
    titleDates.add(titleDateIdentity(s.title, s.publishedAt));
  }

  return live.filter((n) => {
    if (urls.has(canonicalUrl(n.sourceUrl))) return false;
    if (n.sourceNoticeId && boardIds.has(n.sourceNoticeId)) return false;
    return !titleDates.has(titleDateIdentity(n.title, n.publishedAt));
  });
}
