import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { classifyNotice } from "./classify";
import { extractCandidateDates } from "./extract-dates";
import type { CandidateDate, PendingNotice, QueueStatus } from "./review-schema";

/**
 * Turning discovered official notices into reviewable queue items.
 *
 * Discovery itself is NOT re-implemented here -- lib/notices/discovery.ts
 * already fetches, parses, domain-checks and de-duplicates the Study in Korea
 * board into public.notices. This module reads what that job stored and adds
 * the editorial layer on top: classification, candidate dates, review status.
 * One crawler, one index, one queue.
 */

/** The board's own notice id, read off the canonical URL. Null when absent. */
export function extractSourceNoticeId(sourceUrl: string): string | null {
  try {
    return new URL(sourceUrl).searchParams.get("nttId");
  } catch {
    return null;
  }
}

/**
 * Domain gate, applied a second time at the queue boundary.
 *
 * discovery.ts already refuses to store an off-domain notice, so in normal
 * operation this never fires. It is here because "official sources only" is
 * the property the whole feature rests on, and a rule that important should
 * not depend on a single upstream check staying correct. Requires https and
 * an exact host match -- no suffix matching, so a lookalike host such as
 * studyinkorea.go.kr.example.com cannot pass.
 */
export function isOfficialUrl(url: string, officialDomain: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname.toLowerCase() === officialDomain.toLowerCase();
  } catch {
    return false;
  }
}

export interface DiscoveredNotice {
  id: string;
  source_id: string;
  source_url: string;
  title: string | null;
  published_date: string | null;
  clean_text: string | null;
}

export interface NormalizedPending {
  notice_id: string;
  source_id: string;
  source_url: string;
  source_notice_id: string | null;
  title: string;
  published_at: string | null;
  program: PendingNotice["program"];
  track: PendingNotice["track"];
  notice_type: PendingNotice["notice_type"];
  extracted_dates: CandidateDate[];
  source_publisher: string;
  status: QueueStatus;
}

/** Raised for a notice that cannot be normalized. Caught per-item so one bad row can't end a run. */
export class NormalizeError extends Error {}

/**
 * Normalizes one discovered notice into a pending review record.
 *
 * Throws rather than returning a half-filled record: a notice with no title
 * is not something to show a reviewer with an invented placeholder, it is a
 * parse failure the run should report. A missing PUBLICATION date is not a
 * failure -- that is a legitimate null the board sometimes serves.
 */
export function normalizePending(
  notice: DiscoveredNotice,
  opts: { officialDomain: string; publisher: string }
): NormalizedPending {
  const title = (notice.title ?? "").trim();
  if (!title) throw new NormalizeError("notice has no title");
  if (!notice.source_url) throw new NormalizeError("notice has no source_url");
  if (!isOfficialUrl(notice.source_url, opts.officialDomain)) {
    throw new NormalizeError(`source_url outside official domain ${opts.officialDomain}`);
  }

  const body = notice.clean_text ?? "";
  const { program, track, notice_type } = classifyNotice(title, body);

  return {
    notice_id: notice.id,
    source_id: notice.source_id,
    source_url: notice.source_url,
    source_notice_id: extractSourceNoticeId(notice.source_url),
    title,
    published_at: notice.published_date ?? null,
    program,
    track,
    notice_type,
    // Title included so a date stated only in the headline is still surfaced.
    extracted_dates: extractCandidateDates(`${title}\n${body}`, notice.source_url),
    source_publisher: opts.publisher,
    status: "pending_review",
  };
}

/**
 * Dedupe keys, layered in the spec's order of preference:
 *   1. notice_id        -- the discovered row is already queued
 *   2. source_url       -- canonical official URL already queued
 *   3. source_notice_id -- the board's own id, catching the case where the
 *      same notice is reachable under a URL variant
 *   4. title + published_at -- last-resort fallback for a re-post that
 *      carries neither a matching id nor a matching URL
 *
 * A match at ANY layer means skip. Re-running is therefore a no-op, and an
 * already-reviewed item is never resurrected as pending.
 */
export interface QueueKeys {
  noticeIds: Set<string>;
  sourceUrls: Set<string>;
  sourceNoticeIds: Set<string>;
  titleDates: Set<string>;
}

export const titleDateKey = (title: string, publishedAt: string | null) =>
  `${title.trim().toLowerCase().replace(/\s+/g, " ")}|${publishedAt ?? ""}`;

export function isAlreadyQueued(item: NormalizedPending, keys: QueueKeys): boolean {
  if (keys.noticeIds.has(item.notice_id)) return true;
  if (keys.sourceUrls.has(item.source_url)) return true;
  if (item.source_notice_id && keys.sourceNoticeIds.has(item.source_notice_id)) return true;
  return keys.titleDates.has(titleDateKey(item.title, item.published_at));
}

export function buildQueueKeys(
  rows: {
    notice_id: string;
    source_url: string;
    source_notice_id: string | null;
    title: string;
    published_at: string | null;
  }[]
): QueueKeys {
  const keys: QueueKeys = {
    noticeIds: new Set(),
    sourceUrls: new Set(),
    sourceNoticeIds: new Set(),
    titleDates: new Set(),
  };
  for (const r of rows) {
    keys.noticeIds.add(r.notice_id);
    keys.sourceUrls.add(r.source_url);
    if (r.source_notice_id) keys.sourceNoticeIds.add(r.source_notice_id);
    keys.titleDates.add(titleDateKey(r.title, r.published_at));
  }
  return keys;
}

export interface EnqueueResult {
  discovered: number;
  queued: number;
  skippedKnown: number;
  parseFailures: { sourceUrl: string; reason: string }[];
  errors: string[];
}

/**
 * Reads every notice discovery has stored for the active official sources and
 * queues the ones not yet reviewed.
 *
 * Each notice is normalized inside its own try/catch: a single malformed
 * notice is reported as a parse failure and the batch continues. That is the
 * whole point of the per-item boundary -- a markup change on one notice must
 * not cost us the other forty.
 */
export async function enqueuePendingNotices(): Promise<EnqueueResult> {
  const admin = getSupabaseAdmin();
  const result: EnqueueResult = { discovered: 0, queued: 0, skippedKnown: 0, parseFailures: [], errors: [] };

  const { data: sources, error: sourceError } = await admin
    .from("sources")
    .select("id, name, official_domain, active, source_type")
    .eq("active", true)
    .eq("source_type", "study_in_korea");
  if (sourceError) throw new Error(`loading sources failed: ${sourceError.message}`);
  if (!sources?.length) return result;

  const { data: queued, error: queueError } = await admin
    .from("notice_review_queue")
    .select("notice_id, source_url, source_notice_id, title, published_at");
  if (queueError) throw new Error(`loading review queue failed: ${queueError.message}`);
  const keys = buildQueueKeys(queued ?? []);

  for (const source of sources) {
    const { data: notices, error: noticeError } = await admin
      .from("notices")
      .select("id, source_id, source_url, title, published_date, clean_text")
      .eq("source_id", source.id)
      .order("published_date", { ascending: false, nullsFirst: false });

    if (noticeError) {
      result.errors.push(`loading notices for ${source.name} failed: ${noticeError.message}`);
      continue;
    }

    for (const notice of notices ?? []) {
      result.discovered++;
      let pending: NormalizedPending;
      try {
        pending = normalizePending(notice as DiscoveredNotice, {
          officialDomain: source.official_domain,
          publisher: source.name,
        });
      } catch (e) {
        result.parseFailures.push({ sourceUrl: notice.source_url ?? "(no url)", reason: (e as Error).message });
        continue;
      }

      if (isAlreadyQueued(pending, keys)) {
        result.skippedKnown++;
        continue;
      }

      const { error: insertError } = await admin.from("notice_review_queue").insert({
        notice_id: pending.notice_id,
        source_id: pending.source_id,
        source_url: pending.source_url,
        source_notice_id: pending.source_notice_id,
        title: pending.title,
        published_at: pending.published_at,
        source_publisher: pending.source_publisher,
        program: pending.program,
        track: pending.track,
        notice_type: pending.notice_type,
        extracted_dates: pending.extracted_dates,
        status: "pending_review",
      });

      if (insertError) {
        // A unique-violation here means a concurrent run won the race. That is
        // the DB doing its job, not an error worth failing the run over.
        if (insertError.code === "23505") {
          result.skippedKnown++;
        } else {
          result.errors.push(`queueing ${pending.source_url} failed: ${insertError.message}`);
        }
        continue;
      }

      // Keep the in-memory keys current so two notices in the SAME batch that
      // collide on the fallback key don't both get inserted.
      keys.noticeIds.add(pending.notice_id);
      keys.sourceUrls.add(pending.source_url);
      if (pending.source_notice_id) keys.sourceNoticeIds.add(pending.source_notice_id);
      keys.titleDates.add(titleDateKey(pending.title, pending.published_at));
      result.queued++;
    }
  }

  return result;
}
