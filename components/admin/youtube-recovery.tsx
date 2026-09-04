"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatInstant } from "@/lib/youtube/day-window";
import type { RecoveryCategory, RecoveryLegacyOutcome, RecoveryStatus } from "@/lib/youtube/recovery";
import {
  RECOVERY_LEGACY_OUTCOME_LABELS,
  RECOVERY_REFUSAL_TEXT,
  RECOVERY_STATUS_LABELS,
  canHoldOrSkipRecovery,
  canUnholdRecovery,
  evidenceChannelId,
  evidenceCheckedAt,
  evidenceMethod,
  evidenceNotes,
  evidenceResult,
  recoveryDecisionRefusal,
  recoveryStatusTone,
} from "@/lib/youtube/recovery-review";
import { readLatestVerification } from "@/lib/youtube/recovery-verify";

/**
 * Manual review for recovery attempts.
 *
 * A recovery attempt is a fresh reply drafted for a comment whose PREVIOUS
 * reply YouTube removed. That makes this the most consequential review screen
 * in the feature, and the screen is built to make one thing unmissable: whether
 * the removal of the legacy reply is actually proven. A row whose legacy
 * outcome is still POSTED_RECORDED cannot be approved, and says so.
 *
 * Deliberately separate from the outreach queue above it. These rows are not
 * merged into youtube_reply_queue, and nothing here sends anything -- there is
 * no Post button on this screen at all.
 */

export interface RecoveryItem {
  id: string;
  youtube_comment_id: string;
  legacy_reply_id: string;
  legacy_draft_text: string | null;
  legacy_outcome: RecoveryLegacyOutcome;
  legacy_evidence: Record<string, unknown> | null;
  recovery_set: string;
  author_name: string;
  recovery_batch: number;
  recovery_order: number;
  category: RecoveryCategory;
  draft_text: string;
  status: RecoveryStatus;
  decided_at: string | null;
  posted_reply_id: string | null;
  api_accepted_at: string | null;
  verified_at: string | null;
  removed_detected_at: string | null;
  last_error: string | null;
  parent_comment_text: string | null;
  parent_video_title: string | null;
  parent_source_url: string | null;
}

interface Props {
  items: RecoveryItem[];
  counts: {
    total: number;
    byStatus: Record<string, number>;
    byLegacyOutcome: Record<string, number>;
    decided: number;
    posted: number;
  };
}

const TONE_STYLES: Record<string, string> = {
  success: "bg-success-soft text-success",
  ready: "bg-primary/10 text-primary",
  pending: "bg-gold/10 text-gold",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-canvas text-muted",
};

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ${className || "bg-canvas text-muted"}`}>
      {children}
    </span>
  );
}

// Pinned to one zone by formatInstant, so the server and the browser render
// the same string and React does not report a hydration mismatch.
const formatWhen = formatInstant;

/**
 * Always shown in the summary, even at zero.
 *
 * These are exactly the four states a review verb can produce. Rendering only
 * the statuses present in the data hid "Approved 0" and "Hold 0" entirely,
 * which reads as "not tracked" rather than "none yet" -- and those two are the
 * numbers a reviewer most wants confirmed before trusting the screen.
 */
const ALWAYS_SHOWN_STATUSES: RecoveryStatus[] = ["DRAFTED", "APPROVED", "HOLD", "SKIP"];

export function YoutubeRecovery({ items, counts }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function decide(item: RecoveryItem, action: "approve" | "hold" | "skip" | "unhold") {
    if (action === "approve") {
      const confirmed = window.confirm(
        `Approve recovery attempt #${item.recovery_order} for ${item.author_name}?\n\n` +
          "This marks it reviewed and ready. It does NOT send anything to YouTube — " +
          "there is no posting action on this screen."
      );
      if (!confirmed) return;
    }

    setBusyId(item.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/youtube/recovery/${item.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        const reason = typeof payload.reason === "string" ? payload.reason : null;
        setMessage({
          tone: "error",
          text: (reason && RECOVERY_REFUSAL_TEXT[reason]) ?? reason ?? `Request failed (${response.status})`,
        });
        return;
      }

      const confirmation =
        action === "approve"
          ? "Approved for review. Nothing was sent to YouTube."
          : action === "unhold"
            ? "Returned to review as a draft. It still needs a separate approval."
            : `Marked ${action === "hold" ? "on hold" : "skipped"}.`;
      setMessage({ tone: "ok", text: confirmation });
      window.location.reload();
    } catch {
      setMessage({ tone: "error", text: "The request could not be completed." });
    } finally {
      setBusyId(null);
    }
  }

  if (counts.total === 0) {
    return (
      <Card className="p-4">
        <h2 className="text-[15px] font-semibold text-ink">Recovery attempts</h2>
        <p className="mt-1 text-[13px] text-muted">No recovery attempts have been imported.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="border-primary/30 p-4">
        <h2 className="text-[15px] font-semibold text-ink">Recovery attempts — manual review</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Fresh drafts for comments whose <em>previous</em> reply YouTube removed. These are separate
          records: the original queue rows keep their REMOVED state, legacy reply ids and history
          untouched. Approving marks an attempt reviewed — <strong className="text-ink">nothing on
          this screen sends anything to YouTube</strong>.
        </p>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-muted">
          <span>
            Total <span className="text-ink">{counts.total}</span>
          </span>
          {ALWAYS_SHOWN_STATUSES.map((status) => (
            <span key={status}>
              {RECOVERY_STATUS_LABELS[status]}{" "}
              <span className="text-ink">{counts.byStatus[status] ?? 0}</span>
            </span>
          ))}
          {/* Anything outside the four review states, shown only if it occurs. */}
          {Object.entries(counts.byStatus)
            .filter(([status, n]) => n > 0 && !ALWAYS_SHOWN_STATUSES.includes(status as RecoveryStatus))
            .map(([status, n]) => (
              <span key={status}>
                {RECOVERY_STATUS_LABELS[status as RecoveryStatus] ?? status}{" "}
                <span className="text-ink">{n}</span>
              </span>
            ))}
          <span>
            Decided <span className="text-ink">{counts.decided}</span>
          </span>
          <span>
            Sent to YouTube <span className="text-ink">{counts.posted}</span>
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 border-t border-hairline pt-2 text-[12px] text-muted">
          {Object.entries(counts.byLegacyOutcome).map(([outcome, n]) => (
            <span key={outcome}>
              {RECOVERY_LEGACY_OUTCOME_LABELS[outcome as RecoveryLegacyOutcome] ?? outcome}:{" "}
              <span className="text-ink">{n}</span>
            </span>
          ))}
        </div>
      </Card>

      {items.map((item) => {
        const busy = busyId === item.id;
        const approveBlock = recoveryDecisionRefusal("approve", item);
        const holdSkipAllowed = canHoldOrSkipRecovery(item);
        // Shown only for a held attempt. It returns the row to DRAFTED; it
        // never approves, so a held row still needs a separate approval.
        const unholdAllowed = canUnholdRecovery(item);
        const isOpen = expanded === item.id;
        // Green means "still proven right now", not "was proven once". A row
        // whose latest exact-id check contradicts its stored outcome is shown
        // as unproven, matching the approval gate rather than contradicting it.
        const latestCheck = readLatestVerification(item.legacy_evidence);
        const removalProven =
          item.legacy_outcome === "CONFIRMED_REMOVED" &&
          (latestCheck === null || latestCheck.result === "CONFIRMED_REMOVED");

        return (
          <Card key={item.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip className={TONE_STYLES[recoveryStatusTone(item.status)]}>
                    {RECOVERY_STATUS_LABELS[item.status]}
                  </Chip>
                  <Chip className="bg-canvas text-ink">
                    Batch {item.recovery_batch} · #{item.recovery_order}
                  </Chip>
                  <Chip className="bg-canvas text-ink">{item.category}</Chip>
                  <Chip className={removalProven ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}>
                    {RECOVERY_LEGACY_OUTCOME_LABELS[item.legacy_outcome]}
                  </Chip>
                  {item.decided_at && <Chip>Decided {formatWhen(item.decided_at)}</Chip>}
                </div>

                <p className="mt-2 text-[13.5px] font-medium text-ink">{item.author_name}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {item.parent_video_title ?? "Video not in the current queue"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : item.id)}
                className="text-[12.5px] text-muted underline underline-offset-2"
              >
                {isOpen ? "Hide evidence" : "Evidence"}
              </button>
            </div>

            {/* ---- the parent comment being answered ---- */}
            <div className="mt-3">
              <p className="text-[11.5px] text-muted">Original comment</p>
              {item.parent_comment_text ? (
                <p className="mt-1 rounded-lg bg-canvas px-3 py-2 text-[13px] leading-relaxed text-ink">
                  {item.parent_comment_text}
                </p>
              ) : (
                <p className="mt-1 rounded-lg bg-canvas px-3 py-2 text-[12.5px] italic text-muted">
                  Not available — this parent predates the current queue. Comment id{" "}
                  <code className="break-all not-italic">{item.youtube_comment_id}</code>
                </p>
              )}
            </div>

            {/* ---- what was sent before, and what happened to it ---- */}
            <div className="mt-3 rounded-lg border border-hairline px-3 py-2">
              <p className="text-[11.5px] text-muted">Legacy reply (removed by YouTube)</p>
              <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted line-through decoration-danger/40">
                {item.legacy_draft_text ?? "(text not recorded)"}
              </p>
              <p className="mt-1.5 text-[11.5px] text-muted">
                Legacy reply id{" "}
                <code className="break-all text-ink">{item.legacy_reply_id}</code>
              </p>
              <p className="mt-0.5 text-[11.5px]">
                <span className={removalProven ? "text-success" : "text-danger"}>
                  {evidenceResult(item.legacy_evidence) ?? item.legacy_outcome}
                </span>
                {evidenceMethod(item.legacy_evidence) && (
                  <span className="text-muted"> · {evidenceMethod(item.legacy_evidence)}</span>
                )}
                {evidenceCheckedAt(item.legacy_evidence) && (
                  <span className="text-muted"> · checked {formatWhen(evidenceCheckedAt(item.legacy_evidence))}</span>
                )}
              </p>
              {evidenceNotes(item.legacy_evidence) && (
                <p className="mt-1 text-[11.5px] italic text-muted">
                  {evidenceNotes(item.legacy_evidence)}
                </p>
              )}
            </div>

            {/* ---- the fresh draft under review ---- */}
            <div className="mt-3">
              <p className="text-[11.5px] text-muted">Fresh recovery draft</p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-canvas px-3 py-2 text-[13px] leading-relaxed text-ink">
                {item.draft_text}
              </p>
            </div>

            {/* ---- outcome of any later send (none exist yet) ---- */}
            {item.posted_reply_id && (
              <div className="mt-3 rounded-lg border border-hairline px-3 py-2 text-[12px]">
                <p className="text-muted">
                  New reply id <code className="break-all text-ink">{item.posted_reply_id}</code>
                </p>
                <p className="mt-1 text-muted">
                  API accepted {formatWhen(item.api_accepted_at)}
                  {item.status === "API_ACCEPTED" && (
                    <span className="text-gold"> · not yet confirmed live</span>
                  )}
                </p>
                {item.verified_at && (
                  <p className="mt-1 text-success">Verified live {formatWhen(item.verified_at)}</p>
                )}
                {item.removed_detected_at && (
                  <p className="mt-1 text-danger">Removed again {formatWhen(item.removed_detected_at)}</p>
                )}
              </div>
            )}

            {item.last_error && (
              <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[12px] text-danger">
                {item.last_error}
              </p>
            )}

            {isOpen && (
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-canvas px-3 py-2 text-[11px] leading-relaxed text-muted">
                {JSON.stringify(item.legacy_evidence ?? {}, null, 2)}
              </pre>
            )}

            {isOpen && evidenceChannelId(item.legacy_evidence) && (
              <p className="mt-1 text-[11.5px] text-muted">
                Verified against channel{" "}
                <code className="break-all text-ink">{evidenceChannelId(item.legacy_evidence)}</code>{" "}
                · recovery set <code className="break-all">{item.recovery_set}</code>
              </p>
            )}

            {/* ---- review actions ---- */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {approveBlock === null && (
                <Button disabled={busy} onClick={() => decide(item, "approve")}>
                  {busy ? "Saving…" : "Approve"}
                </Button>
              )}

              {unholdAllowed && (
                <Button variant="secondary" disabled={busy} onClick={() => decide(item, "unhold")}>
                  Return to review
                </Button>
              )}

              {holdSkipAllowed && !unholdAllowed && (
                <Button variant="ghost" disabled={busy} onClick={() => decide(item, "hold")}>
                  Hold
                </Button>
              )}

              {holdSkipAllowed && (
                <Button variant="ghost" disabled={busy} onClick={() => decide(item, "skip")}>
                  Skip
                </Button>
              )}

              {approveBlock && (
                <span className="text-[12px] text-muted">
                  {RECOVERY_REFUSAL_TEXT[approveBlock] ?? approveBlock}
                </span>
              )}
            </div>
          </Card>
        );
      })}

      {message && (
        <div
          className={`rounded-xl px-4 py-3 text-[13px] ${
            message.tone === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
