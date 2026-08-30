import type { Metadata } from "next";
import { requireAdmin } from "@/lib/supabase/auth-server";
import { AdminNav } from "@/components/admin/admin-nav";
import {
  YoutubeOutreach,
  type BatchItem,
  type QueueItem,
} from "@/components/admin/youtube-outreach";
import {
  countByStatus,
  countRecentPosts,
  dailyPostLimit,
  listBatches,
  listQueue,
  minVerifyAgeHours,
} from "@/lib/youtube/queue";
import { isYoutubeConfigured } from "@/lib/youtube/oauth";
import { isYoutubeStatus } from "@/lib/youtube/queue-schema";

export const metadata: Metadata = {
  title: "YouTube Outreach — KMate",
};

// Operator state that changes on every action; never cache it.
export const dynamic = "force-dynamic";

/**
 * Admin console for replying to GKS questions left on YouTube.
 *
 * Replaces a local Python bot that posted in bulk and reported success it
 * could not know it had. Everything consequential here is one row at a time,
 * behind an explicit click: this page renders no control that posts more than
 * a single reply, and there is no scheduled job behind it.
 */
export default async function AdminYoutubePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; batch?: string; q?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const status = isYoutubeStatus(params.status) ? params.status : "";
  const batchId = typeof params.batch === "string" ? params.batch : "";
  const search = typeof params.q === "string" ? params.q.slice(0, 120) : "";

  let rows;
  let batches;
  let counts: Record<string, number>;
  let postedInWindow: number;

  try {
    [rows, batches, counts, postedInWindow] = await Promise.all([
      listQueue({ status: status || undefined, batchId: batchId || undefined, search: search || undefined }),
      listBatches(),
      countByStatus(),
      countRecentPosts(24),
    ]);
  } catch {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-[22px] font-semibold text-ink">YouTube outreach</h1>
        <div className="mt-4">
          <AdminNav active="/admin/youtube" />
        </div>
        <p className="mt-6 text-[14px] text-gold">
          The outreach queue could not be loaded. If this is a fresh environment, the
          youtube_reply_* tables may not have been created yet — re-run supabase/schema.sql.
        </p>
      </main>
    );
  }

  const items: QueueItem[] = rows.map((r) => ({
    id: r.id,
    batch_id: r.batch_id,
    spreadsheet_row: r.spreadsheet_row,
    youtube_comment_id: r.youtube_comment_id,
    video_id: r.video_id,
    video_title: r.video_title,
    channel_title: r.channel_title,
    source_url: r.source_url,
    author_name: r.author_name,
    original_text: r.original_text,
    source_type: r.source_type,
    topic: r.topic,
    general_reply: r.general_reply,
    kmate_reply: r.kmate_reply,
    use_kmate: r.use_kmate,
    best_choice: r.best_choice,
    final_draft: r.final_draft,
    edited_draft: r.edited_draft,
    automation_action: r.automation_action,
    status: r.status,
    is_legacy: r.is_legacy,
    legacy_source: r.legacy_source,
    posted_reply_id: r.posted_reply_id,
    api_accepted_at: r.api_accepted_at,
    verified_at: r.verified_at,
    last_verified_at: r.last_verified_at,
    removed_detected_at: r.removed_detected_at,
    attempt_count: r.attempt_count,
    last_error: r.last_error,
    created_at: r.created_at,
  }));

  const batchItems: BatchItem[] = batches.map((b) => ({
    id: b.id,
    label: b.label,
    kind: b.kind,
    imported_at: b.imported_at,
    total_rows: b.total_rows,
    eligible_rows: b.eligible_rows,
    imported_rows: b.imported_rows,
    already_known_rows: b.already_known_rows,
    skipped_rows: b.skipped_rows,
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">YouTube outreach</h1>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
        Import a scout spreadsheet, review each draft, and post replies one at a time. A reply
        YouTube accepts is not yet a reply that is live — only a delayed check, at least{" "}
        {minVerifyAgeHours()} hours later, can confirm that.
      </p>
      <div className="mt-4">
        <AdminNav active="/admin/youtube" />
      </div>

      <div className="mt-6">
        <YoutubeOutreach
          items={items}
          batches={batchItems}
          counts={counts}
          dailyLimit={dailyPostLimit()}
          postedInWindow={postedInWindow}
          minVerifyAgeHours={minVerifyAgeHours()}
          youtubeConfigured={isYoutubeConfigured()}
          activeStatus={status}
          activeBatch={batchId}
          search={search}
        />
      </div>
    </main>
  );
}
