import { ExternalLink, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { PublishedGksNotice } from "@/lib/notices/published-schema";
import type { QueueNoticeType } from "@/lib/notices/review-schema";

/**
 * One approved GKS notice.
 *
 * The badge wording is load-bearing. "Reviewed" says a person checked that
 * this notice really is a GKS-U/GKS-G notice of the stated type -- nothing
 * more. It is deliberately not "Verified deadline": the notice may well
 * contain dates, but no date shown anywhere in KMate becomes a deadline
 * because a notice was approved. This card therefore renders no date except
 * the notice's own publication date, and no countdown of any kind.
 */

const TYPE_LABELS: Record<QueueNoticeType, string> = {
  guideline: "Guideline",
  result: "Result",
  schedule_change: "Schedule change",
  deadline: "Deadline",
  other: "Notice",
};

const PROGRAM_BADGE: Record<PublishedGksNotice["program"], string> = {
  "GKS-U": "bg-gks-u/10 text-gks-u",
  "GKS-G": "bg-gks-g/10 text-gks-g",
};

const TRACK_LABELS = { embassy: "Embassy Track", university: "University Track" } as const;

function formatDate(value: string | null): string {
  if (!value) return "No publication date stated";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function GksNoticeCard({ notice }: { notice: PublishedGksNotice }) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${PROGRAM_BADGE[notice.program]}`}>
          {notice.program}
        </span>
        {/* A null track is not rendered as "no track" -- the notice simply
            names none, so no track claim is made on screen at all. */}
        {notice.track && (
          <span className="rounded-full bg-canvas px-2.5 py-0.5 text-[11.5px] font-medium text-ink">
            {TRACK_LABELS[notice.track]}
          </span>
        )}
        <span className="rounded-full bg-canvas px-2.5 py-0.5 text-[11.5px] font-medium text-muted">
          {TYPE_LABELS[notice.noticeType]}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-[11.5px] font-medium text-success">
          <ShieldCheck className="h-3 w-3" />
          Official · Reviewed
        </span>
      </div>

      <h2 className="break-words text-[15px] font-semibold leading-snug text-ink">{notice.title}</h2>

      <p className="text-[12.5px] text-muted">
        {formatDate(notice.publishedAt)} · {notice.publisher}
      </p>

      <a
        href={notice.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-full items-center gap-1.5 self-start break-all text-[13px] font-medium text-primary hover:underline"
      >
        Read the official notice
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
    </Card>
  );
}
