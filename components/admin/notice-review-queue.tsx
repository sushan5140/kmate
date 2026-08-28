"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CANDIDATE_KIND_LABELS,
  NOTICE_TYPE_LABELS,
  PROGRAM_LABELS,
  type CandidateDate,
  type PendingNotice,
  type QueueStatus,
} from "@/lib/notices/review-schema";

/**
 * Review queue for discovered official notices.
 *
 * The screen's job is to make a reviewer's decision easy to get right, which
 * mostly means being honest about what is unknown: "Unknown program" and
 * "Track not stated" are shown as visible chips rather than hidden or filled
 * in with a plausible guess.
 *
 * Candidate dates are labelled as candidates everywhere they appear. Approving
 * a notice records that its metadata is correct -- it does not publish a
 * deadline, and this component offers no control that could.
 */

export type ReviewItem = Pick<
  PendingNotice,
  | "id"
  | "title"
  | "source_url"
  | "source_notice_id"
  | "published_at"
  | "program"
  | "track"
  | "notice_type"
  | "extracted_dates"
  | "source_publisher"
  | "status"
>;

const STATUS_STYLES: Record<QueueStatus, string> = {
  pending_review: "bg-gold/10 text-gold",
  approved: "bg-success-soft text-success",
  rejected: "bg-canvas text-muted",
};

const STATUS_LABELS: Record<QueueStatus, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

const CONFIDENCE_LABEL: Record<CandidateDate["confidence"], string> = {
  high: "clear cue",
  medium: "weak cue",
  low: "no cue",
};

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "unknown" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        tone === "unknown" ? "bg-canvas text-muted italic" : "bg-canvas text-ink"
      }`}
    >
      {children}
    </span>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function NoticeReviewQueue({ items: initial }: { items: ReviewItem[] }) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openDatesId, setOpenDatesId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  async function moderate(id: string, action: "approve" | "reject" | "pending") {
    setBusyId(id);
    setFailedId(null);
    try {
      const res = await fetch(`/api/admin/notice-queue/${id}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setFailedId(id);
        return;
      }
      const { status } = (await res.json()) as { status: QueueStatus };
      // The row stays on screen with its new status rather than vanishing, so
      // a reviewer can see what they just did and reverse it.
      setItems((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch {
      setFailedId(id);
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-[14px] text-muted">Nothing in the review queue.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const dates = item.extracted_dates ?? [];
        const datesOpen = openDatesId === item.id;
        return (
          <Card key={item.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[item.status]}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                  <Chip tone={item.program === "unknown" ? "unknown" : "neutral"}>
                    {PROGRAM_LABELS[item.program]}
                  </Chip>
                  <Chip tone={item.track === null ? "unknown" : "neutral"}>
                    {item.track === null ? "Track not stated" : item.track === "embassy" ? "Embassy" : "University"}
                  </Chip>
                  <Chip>{NOTICE_TYPE_LABELS[item.notice_type]}</Chip>
                </div>
                <p className="mt-1.5 break-words text-[14px] font-medium leading-snug text-ink">{item.title}</p>
                <p className="mt-1 text-[12px] text-muted">
                  {item.published_at ? formatDate(item.published_at) : "No publication date stated"}
                  {" · "}
                  {item.source_publisher}
                  {item.source_notice_id ? ` · notice ${item.source_notice_id}` : ""}
                </p>
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block break-all text-[12px] font-medium text-primary hover:underline"
                >
                  Open official notice
                </a>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => moderate(item.id, "approve")}
                  disabled={busyId === item.id || item.status === "approved"}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => moderate(item.id, "reject")}
                  disabled={busyId === item.id || item.status === "rejected"}
                >
                  Reject
                </Button>
                {item.status !== "pending_review" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moderate(item.id, "pending")}
                    disabled={busyId === item.id}
                  >
                    Leave pending
                  </Button>
                )}
              </div>
            </div>

            {failedId === item.id && (
              <p className="text-[12.5px] text-gold">That did not save. Try again.</p>
            )}

            <div className="border-t border-hairline pt-2.5">
              {dates.length === 0 ? (
                <p className="text-[12.5px] text-muted">No dates found in this notice.</p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setOpenDatesId(datesOpen ? null : item.id)}
                    className="text-[12.5px] font-medium text-primary hover:underline"
                  >
                    {datesOpen ? "Hide" : "Show"} {dates.length} candidate date{dates.length === 1 ? "" : "s"}
                  </button>
                  {/* Stated on the screen itself, not just in code comments: a
                      reviewer must never read this list as a set of deadlines
                      KMate has accepted. */}
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                    Candidates only — dates found in the official text. None of these becomes a KMate deadline;
                    that stays a source-controlled change.
                  </p>
                  {datesOpen && (
                    <ul className="mt-2 flex flex-col gap-2">
                      {dates.map((d, i) => (
                        <li key={`${d.date}-${d.kind}-${i}`} className="rounded-lg bg-canvas px-2.5 py-2">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[12.5px] font-semibold text-ink">{formatDate(d.date)}</span>
                            <span className="text-[11.5px] text-muted">{CANDIDATE_KIND_LABELS[d.kind]}</span>
                            <span className="text-[11px] text-muted">· {CONFIDENCE_LABEL[d.confidence]}</span>
                          </div>
                          <p className="mt-1 break-words text-[11.5px] leading-relaxed text-muted">“{d.context}”</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
