import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  fetchNoticeList,
  fetchNoticeDetail,
  sha256,
  detectLanguage,
  excerptSummary,
} from "@/lib/notices/study-in-korea";

/** Phase 1 ages notices purely by publication date -- no deadline logic yet. */
export const FRESHNESS_WINDOW_DAYS = 30;

export interface DiscoveryResult {
  sourceId: string;
  sourceName: string;
  listed: number;
  inserted: number;
  unchanged: number;
  updated: number;
  skipped: { sourceUrl: string; reason: string }[];
  /** Notices whose official content changed in place since we last stored it. */
  changeLog: { sourceUrl: string; title: string; oldHash: string | null; newHash: string }[];
  archived: number;
  errors: string[];
}

interface NoticeRow {
  id: string;
  source_url: string;
  content_hash: string | null;
  status: string;
}

/**
 * Enforces the core principle at the storage boundary: KMate only ever
 * indexes content from a registered, verified official domain. A URL that
 * somehow resolves outside the source's own `official_domain` is skipped and
 * reported, never stored -- so a markup change or an injected off-site link
 * can't quietly get a third-party page into the index.
 */
function isWithinOfficialDomain(url: string, officialDomain: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === "https:" && hostname.toLowerCase() === officialDomain.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Job A -- discovery. Fetches the registered source's notice list, and for
 * each notice compares a SHA-256 of its cleaned body against what's stored:
 *   - unknown source_url        -> insert, status 'new'
 *   - known source_url, same hash    -> no write at all
 *   - known source_url, different hash -> update content + last_verified_at,
 *     and record the change in the returned changeLog
 *
 * source_url is the dedupe key and carries a UNIQUE constraint in the DB, so
 * re-running can't create duplicates even if this logic were wrong.
 */
export async function runDiscovery(): Promise<DiscoveryResult[]> {
  const admin = getSupabaseAdmin();
  const { data: sources, error } = await admin
    .from("sources")
    .select("id, name, notice_url, official_domain, active, source_type")
    .eq("active", true)
    .eq("source_type", "study_in_korea");

  if (error) throw new Error(`loading sources failed: ${error.message}`);

  const results: DiscoveryResult[] = [];

  for (const source of sources ?? []) {
    const result: DiscoveryResult = {
      sourceId: source.id,
      sourceName: source.name,
      listed: 0,
      inserted: 0,
      unchanged: 0,
      updated: 0,
      skipped: [],
      changeLog: [],
      archived: 0,
      errors: [],
    };
    const checkedAt = new Date().toISOString();

    try {
      const items = await fetchNoticeList();
      result.listed = items.length;
      if (items.length === 0) throw new Error("notice list parsed to 0 items -- markup may have changed");

      const { data: existingRows } = await admin
        .from("notices")
        .select("id, source_url, content_hash, status")
        .eq("source_id", source.id)
        .in("source_url", items.map((i) => i.sourceUrl));
      const existingByUrl = new Map<string, NoticeRow>((existingRows ?? []).map((r) => [r.source_url, r as NoticeRow]));

      for (const item of items) {
        if (!isWithinOfficialDomain(item.sourceUrl, source.official_domain)) {
          result.skipped.push({ sourceUrl: item.sourceUrl, reason: "outside registered official_domain" });
          continue;
        }

        let detail;
        try {
          detail = await fetchNoticeDetail(item.sourceUrl);
        } catch (e) {
          result.errors.push(`detail fetch failed for ${item.sourceUrl}: ${(e as Error).message}`);
          continue;
        }

        const cleanText = detail.cleanText;
        const contentHash = sha256(cleanText);
        const existing = existingByUrl.get(item.sourceUrl);
        const now = new Date().toISOString();

        // The list row and the detail page state the title/date
        // independently; prefer the detail page (the notice's own canonical
        // view) and fall back to the list row. Both are read from the
        // source -- neither is synthesised.
        const title = detail.detailTitle ?? item.title;
        const publishedDate = detail.detailDate ?? item.publishedDate;

        if (!existing) {
          const { error: insertError } = await admin.from("notices").insert({
            source_id: source.id,
            title,
            source_url: item.sourceUrl,
            published_date: publishedDate,
            summary: excerptSummary(cleanText),
            original_text: detail.originalText || null,
            clean_text: cleanText || null,
            language: detectLanguage(cleanText || title),
            status: "new",
            is_active: true,
            content_hash: contentHash,
            last_verified_at: now,
          });
          if (insertError) result.errors.push(`insert failed for ${item.sourceUrl}: ${insertError.message}`);
          else result.inserted++;
          continue;
        }

        if (existing.content_hash === contentHash) {
          // Spec'd behaviour for Phase 1: same URL + same hash writes nothing.
          result.unchanged++;
          continue;
        }

        const { error: updateError } = await admin
          .from("notices")
          .update({
            title,
            published_date: publishedDate,
            summary: excerptSummary(cleanText),
            original_text: detail.originalText || null,
            clean_text: cleanText || null,
            language: detectLanguage(cleanText || title),
            content_hash: contentHash,
            last_verified_at: now,
            updated_at: now,
          })
          .eq("id", existing.id);

        if (updateError) {
          result.errors.push(`update failed for ${item.sourceUrl}: ${updateError.message}`);
        } else {
          result.updated++;
          result.changeLog.push({
            sourceUrl: item.sourceUrl,
            title,
            oldHash: existing.content_hash,
            newHash: contentHash,
          });
          console.log(
            `[notices] content changed: ${item.sourceUrl} (${existing.content_hash?.slice(0, 12) ?? "null"} -> ${contentHash.slice(0, 12)})`
          );
        }
      }

      result.archived = await runFreshnessAging(source.id);

      await admin
        .from("sources")
        .update({ last_checked_at: checkedAt, last_successful_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", source.id);
    } catch (e) {
      result.errors.push((e as Error).message);
      // last_checked_at advances even on failure (we did check); only
      // last_successful_at is withheld, so a stuck source is visible.
      await admin
        .from("sources")
        .update({ last_checked_at: checkedAt, updated_at: new Date().toISOString() })
        .eq("id", source.id);
    }

    results.push(result);
  }

  return results;
}

/**
 * Job B -- freshness aging. Phase 1 has no deadline concept, so a notice
 * simply ages out by publication date: anything published more than
 * FRESHNESS_WINDOW_DAYS ago moves to 'archived'.
 *
 * Rows with a NULL published_date are left alone -- the source didn't state
 * a date, and inventing one to age against would be exactly the kind of
 * fabrication this system forbids.
 */
export async function runFreshnessAging(sourceId?: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - FRESHNESS_WINDOW_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  let query = admin
    .from("notices")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .in("status", ["new", "current"])
    .not("published_date", "is", null)
    .lt("published_date", cutoffDate);

  if (sourceId) query = query.eq("source_id", sourceId);

  const { data, error } = await query.select("id");
  if (error) throw new Error(`freshness aging failed: ${error.message}`);
  return data?.length ?? 0;
}
