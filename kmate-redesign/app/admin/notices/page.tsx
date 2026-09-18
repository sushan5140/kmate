import type { Metadata } from "next";
import { requireAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { NoticeReviewQueue, type ReviewItem } from "@/components/admin/notice-review-queue";
import type { CandidateDate } from "@/lib/notices/review-schema";

export const metadata: Metadata = {
  title: "Notice Review — KMate",
};

/**
 * Review queue for official GKS notices discovered from Study in Korea.
 *
 * Pending items first, then recently decided ones so a reviewer can see and
 * reverse what they just did. Nothing on this page publishes: approving
 * records that the classified metadata is correct, and the verified deadline
 * dataset remains a source-controlled file.
 */
export default async function AdminNoticeReviewPage() {
  await requireAdmin();

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("notice_review_queue")
    .select(
      "id, title, source_url, source_notice_id, published_at, program, track, notice_type, extracted_dates, source_publisher, status, reviewed_at"
    )
    .order("status", { ascending: true })
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(100);

  const rows = data ?? [];
  const pendingCount = rows.filter((r) => r.status === "pending_review").length;

  // pending_review first, then approved/rejected by recency of decision.
  const ordered = [...rows].sort((a, b) => {
    const aPending = a.status === "pending_review" ? 0 : 1;
    const bPending = b.status === "pending_review" ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return (b.published_at ?? "").localeCompare(a.published_at ?? "");
  });

  const items: ReviewItem[] = ordered.map((r) => ({
    id: r.id,
    title: r.title,
    source_url: r.source_url,
    source_notice_id: r.source_notice_id,
    published_at: r.published_at,
    program: r.program,
    track: r.track,
    notice_type: r.notice_type,
    // jsonb comes back as unknown-shaped; an unreadable value degrades to an
    // empty list rather than breaking the reviewer's page.
    extracted_dates: Array.isArray(r.extracted_dates) ? (r.extracted_dates as CandidateDate[]) : [],
    source_publisher: r.source_publisher,
    status: r.status,
  }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Notice review</h1>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
        Official GKS notices discovered from Study in Korea, awaiting review. Approving confirms the classified
        metadata — it does not publish a deadline. KMate&apos;s verified dates stay in source control.
      </p>
      <div className="mt-4">
        <AdminNav active="/admin/notices" />
      </div>

      {error ? (
        <p className="mt-6 text-[14px] text-gold">
          The review queue could not be loaded. If this is a fresh environment, the
          notice_review_queue table may not have been created yet.
        </p>
      ) : (
        <>
          <p className="mt-6 text-[12.5px] text-muted">
            {pendingCount} pending · {rows.length} shown
          </p>
          <div className="mt-3">
            <NoticeReviewQueue items={items} />
          </div>
        </>
      )}
    </main>
  );
}
