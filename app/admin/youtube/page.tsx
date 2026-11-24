import type { Metadata } from "next";
import { requireAdmin } from "@/lib/supabase/auth-server";
import { AdminNav } from "@/components/admin/admin-nav";
import {
  YoutubeOutreach,
  type BatchItem,
  type FilterState,
  type QueueItem,
} from "@/components/admin/youtube-outreach";
import { YoutubeDaily } from "@/components/admin/youtube-daily";
import { YoutubeRecovery, type RecoveryItem } from "@/components/admin/youtube-recovery";
import {
  countByStatus,
  countPostable,
  listBatches,
  listQueue,
  outreachTimezone,
  minVerifyAgeHours,
  postAllowance,
} from "@/lib/youtube/queue";
import {
  authorHistories,
  channelStats,
  dailyArchive,
  dailySummary,
  getDailyNote,
  getNotes,
  listChannels,
  survivalBreakdown,
} from "@/lib/youtube/analytics";
import { countRecoveryAttempts, listRecoveryAttempts } from "@/lib/youtube/recovery-queue";
import { isYoutubeConfigured } from "@/lib/youtube/oauth";
import { isYoutubeStatus } from "@/lib/youtube/queue-schema";
import {
  carriedFromDay,
  parseDayScope,
  resolveScope,
  today,
  type DayString,
} from "@/lib/youtube/day-window";
import { isOpportunityType, isPriority, type PromotionCategory } from "@/lib/youtube/classify";

export const metadata: Metadata = {
  title: "YouTube Outreach — KMate",
};

// Operator state that changes on every action; never cache it.
export const dynamic = "force-dynamic";

const ARCHIVE_DAYS = 7;

/**
 * Admin console for replying to GKS questions left on YouTube.
 *
 * Two layers over ONE table: a daily workspace derived from timestamps, and
 * the persistent queue itself. No rows are copied or moved per day, and there
 * is no rollover job -- "Today" is a range of UTC instants converted in the
 * configured timezone, and yesterday's unfinished work appears in today's
 * queue because the query says so, not because anything was rewritten.
 *
 * Everything consequential is one row at a time behind an explicit click, or
 * a batch the admin sizes and triggers themselves. There is no scheduled job
 * behind this page.
 */
export default async function AdminYoutubePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const timeZone = outreachTimezone();
  const now = new Date();

  const scope = parseDayScope(params.scope);
  const range = resolveScope(scope, now, timeZone);
  const todayDay = today(now, timeZone);
  const viewDay: DayString = range?.day ?? todayDay;
  const isToday = scope === "today" || viewDay === todayDay;

  const filters: FilterState = {
    scope: typeof params.scope === "string" ? params.scope : "today",
    status: isYoutubeStatus(params.status) ? params.status : "",
    batch: params.batch ?? "",
    priority: isPriority(params.priority) ? params.priority : "",
    opportunity: isOpportunityType(params.opportunity) ? params.opportunity : "",
    promotion: params.promotion ?? "",
    feature: params.feature ?? "",
    channel: params.channel ?? "",
    followUp: params.followUp === "yes" || params.followUp === "no" ? params.followUp : "",
    legacy: params.legacy === "yes" || params.legacy === "no" ? params.legacy : "",
    sort: params.sort === "oldest" ? "oldest" : "newest",
    q: typeof params.q === "string" ? params.q.slice(0, 120) : "",
  };

  /**
   * All reads in one place, returning null on failure.
   *
   * Kept apart from the markup so no JSX is ever constructed inside a
   * try/catch -- React cannot reliably recover a partially built tree, and the
   * error path here is a plain "tables not migrated yet" message anyway.
   */
  const loaded = await (async () => {
    try {
      return await Promise.all([
        listQueue({
          status: filters.status || undefined,
          batchId: filters.batch || undefined,
          search: filters.q || undefined,
          range,
          // Carry-forward only makes sense for the day being worked on now.
          includeCarryForward: isToday && scope !== "all",
          priority: filters.priority || undefined,
          opportunityType: filters.opportunity || undefined,
          promotionCategory: filters.promotion || undefined,
          featureTag: filters.feature || undefined,
          channel: filters.channel || undefined,
          manualFollowUp:
            filters.followUp === "yes" ? true : filters.followUp === "no" ? false : undefined,
          legacy: filters.legacy === "yes" ? true : filters.legacy === "no" ? false : undefined,
          sort: filters.sort === "oldest" ? "oldest" : "newest",
        }),
        listBatches(),
        countByStatus(),
        dailySummary(viewDay, timeZone),
        dailyArchive(todayDay, ARCHIVE_DAYS, timeZone),
        survivalBreakdown(null),
        channelStats(),
        listChannels(),
        getDailyNote(viewDay),
        countPostable().then((eligible) => postAllowance(eligible, now)),
        listRecoveryAttempts(),
        countRecoveryAttempts(),
      ] as const);
    } catch {
      return null;
    }
  })();

  if (!loaded) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-[22px] font-semibold text-ink">YouTube outreach</h1>
        <div className="mt-4">
          <AdminNav active="/admin/youtube" />
        </div>
        <p className="mt-6 text-[14px] text-gold">
          The outreach workspace could not be loaded. If this is a fresh environment, the
          youtube_reply_* tables or the daily-workspace columns may not have been created yet —
          re-run supabase/schema.sql.
        </p>
      </main>
    );
  }

  const [
    rows, batches, counts, summary, archive, survival, channels, channelList, note, allowance,
    recoveryRows, recoveryCounts,
  ] = loaded;

  // Recovery attempts are a SEPARATE review layer, never merged into the queue
  // above. Only display fields cross over; nothing here mutates a queue row.
  const recoveryItems: RecoveryItem[] = recoveryRows.map((r) => ({
    id: r.id,
    youtube_comment_id: r.youtube_comment_id,
    legacy_reply_id: r.legacy_reply_id,
    legacy_draft_text: r.legacy_draft_text,
    legacy_outcome: r.legacy_outcome,
    legacy_evidence: r.legacy_evidence,
    recovery_set: r.recovery_set,
    author_name: r.author_name,
    recovery_batch: r.recovery_batch,
    recovery_order: r.recovery_order,
    category: r.category,
    draft_text: r.draft_text,
    status: r.status,
    decided_at: r.decided_at,
    posted_reply_id: r.posted_reply_id,
    api_accepted_at: r.api_accepted_at,
    verified_at: r.verified_at,
    removed_detected_at: r.removed_detected_at,
    last_error: r.last_error,
    attempt_count: r.attempt_count,
    parent_comment_text: r.parent_comment_text,
    parent_video_title: r.parent_video_title,
    parent_source_url: r.parent_source_url,
  }));

  const archiveNotes = await getNotes(archive.map((a) => a.day));
  const histories = await authorHistories(
    rows.map((r) => r.author_name).filter((a): a is string => Boolean(a))
  );

  const items: QueueItem[] = rows.map((r) => {
    const history = r.author_name ? histories.get(r.author_name) : undefined;
    // A row already posted counts itself in the author history, so subtract
    // it: the warning is about OTHER replies this person has had.
    const previous = Math.max(0, (history?.previousInteractions ?? 0) - (r.api_accepted_at ? 1 : 0));

    return {
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
      discovered_at: r.discovered_at,
      comment_posted_at: r.comment_posted_at,
      priority: r.priority,
      opportunity_type: r.opportunity_type,
      promotion_category: r.promotion_category,
      manual_follow_up: r.manual_follow_up,
      feature_tags: r.feature_tags,
      // Derived, not stored: nothing is written to mark a row as carried.
      carried_from: carriedFromDay(r.discovered_at, viewDay, timeZone),
      author_previous: previous,
      author_last_replied_at: history?.lastRepliedAt ?? null,
    };
  });

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

  const scopeLinks: Array<[string, string]> = [
    ["today", "Today"],
    ["yesterday", "Yesterday"],
    ["all", "All time"],
  ];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">YouTube outreach</h1>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
        Import a scout spreadsheet, review each draft, and post replies yourself — one at a time or
        in a batch you size. A reply YouTube accepts is not yet a reply that is live; only a check
        at least {minVerifyAgeHours()} hours later can confirm that.
      </p>
      <div className="mt-4">
        <AdminNav active="/admin/youtube" />
      </div>

      {/* ---- day scope ---- */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {scopeLinks.map(([value, label]) => (
          <a
            key={value}
            href={`?scope=${value}`}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${
              filters.scope === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-hairline bg-white text-muted"
            }`}
          >
            {label}
          </a>
        ))}
        <form method="get" className="flex items-center gap-2">
          <input
            type="date"
            name="scope"
            defaultValue={range ? viewDay : ""}
            className="rounded-lg border border-hairline bg-surface px-2 py-1.5 text-[12.5px] text-ink"
          />
          <button type="submit" className="text-[12.5px] text-muted underline underline-offset-2">
            Go to date
          </button>
        </form>
      </div>

      <div className="mt-5">
        <YoutubeDaily
          summary={summary}
          archive={archive}
          archiveNotes={Object.fromEntries(archiveNotes)}
          survival={survival.overall}
          survivalByVoice={survival.byVoice}
          survivalByPromotion={survival.byPromotion as Record<PromotionCategory, typeof survival.overall>}
          channels={channels}
          allowance={allowance}
          note={note?.note ?? ""}
          timeZone={timeZone}
          scope={filters.scope}
          isToday={isToday}
          postingEnabled={isYoutubeConfigured()}
        />
      </div>

      {/* Recovery attempts: a separate review layer over a separate table.
          These rows are never merged into the outreach queue below. */}
      <div className="mt-8 border-t border-hairline pt-6">
        <YoutubeRecovery items={recoveryItems} counts={recoveryCounts} />
      </div>

      <div className="mt-8 border-t border-hairline pt-6">
        <YoutubeOutreach
          items={items}
          batches={batchItems}
          channels={channelList}
          counts={counts}
          minVerifyAgeHours={minVerifyAgeHours()}
          youtubeConfigured={isYoutubeConfigured()}
          filters={filters}
        />
      </div>
    </main>
  );
}
