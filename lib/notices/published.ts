import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { QueueNoticeType } from "./review-schema";
import type { PublishedGksNotice, PublishedTrack } from "./published-schema";

/**
 * Applicant-facing GKS notices.
 *
 * The publishing rule this module exists to enforce: a notice reaches an
 * applicant ONLY because a human approved it. Pending and rejected rows are
 * invisible here, and so are approved rows whose program is still "unknown" --
 * approval means "the metadata is right", and metadata that says "we cannot
 * tell which programme this is" cannot personalise anyone's feed.
 *
 * The other rule, equally important: approving a NOTICE is not verifying a
 * DEADLINE. Nothing in this file reads, writes or exposes the candidate dates
 * held in notice_review_queue.extracted_dates. Those stay review-only until a
 * separate, explicit promotion step puts a date in the source-controlled
 * dataset. A published notice carries no date field other than the notice's
 * own publication date.
 *
 * Reads go through the service-role client on the server. notice_review_queue
 * has RLS on with no policy, so it is never reachable from a browser; this
 * module is the only way its approved contents reach an applicant, and it
 * projects a narrow, safe shape rather than the row.
 */

interface QueueJoinRow {
  source_url: string;
  source_notice_id: string | null;
  program: string;
  track: string | null;
  notice_type: string;
  source_publisher: string;
  notice: { id: string; title: string; published_date: string | null; language: string | null; is_active: boolean } | null;
}

/**
 * Every approved, programme-classified GKS notice, newest first.
 *
 * Two filters carry the whole publishing rule:
 *   status = 'approved'   -- pending and rejected never reach an applicant
 *   program <> 'unknown'  -- an unclassified notice is not a GKS notice
 *
 * A row whose underlying public.notices record has been deactivated is
 * dropped too: the official index is the source of truth for whether the
 * notice still stands, and an approval cannot resurrect a withdrawn one.
 */
export async function getApprovedGksNotices(): Promise<PublishedGksNotice[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("notice_review_queue")
    .select(
      "source_url, source_notice_id, program, track, notice_type, source_publisher, notice:notices ( id, title, published_date, language, is_active )"
    )
    .eq("status", "approved")
    .neq("program", "unknown")
    .order("published_at", { ascending: false, nullsFirst: false });

  // A failed read yields an empty feed rather than a thrown page. The feed is
  // supplementary -- Home and /notices both have their own primary content --
  // so a transient database problem should not take a page down.
  if (error || !data) return [];

  return (data as unknown as QueueJoinRow[]).flatMap((row) => {
    if (!row.notice || row.notice.is_active === false) return [];
    if (row.program !== "GKS-U" && row.program !== "GKS-G") return [];
    return [
      {
        id: row.notice.id,
        title: row.notice.title,
        sourceUrl: row.source_url,
        sourceNoticeId: row.source_notice_id,
        publishedAt: row.notice.published_date,
        language: row.notice.language,
        program: row.program,
        track: (row.track === "embassy" || row.track === "university" ? row.track : null) as PublishedTrack,
        noticeType: row.notice_type as QueueNoticeType,
        publisher: row.source_publisher,
        reviewed: true as const,
      },
    ];
  });
}

// Re-exported so callers have a single import site for the published-notice
// surface; the pure rules live in published-schema.ts so client components can
// use them without pulling in this server-only module.
export type { PublishedGksNotice, PublishedProgram, PublishedTrack } from "./published-schema";
export {
  noticeAppliesTo,
  filterPublishedNotices,
  sortNewestFirst,
  dedupeAgainstStatic,
  canonicalUrl,
  titleDateIdentity,
  type NoticeFilter,
  type StaticNoticeKey,
} from "./published-schema";
