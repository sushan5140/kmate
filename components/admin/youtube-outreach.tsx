"use client";

import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  STATUS_LABELS,
  YOUTUBE_STATUSES,
  approveRefusal,
  canEditDraft,
  canHoldOrSkip,
  canMarkFailed,
  canPost,
  canVerify,
  resolveDraft,
  statusTone,
  type QueueRowFacts,
  type YoutubeReplyStatus,
} from "@/lib/youtube/queue-schema";

/**
 * The YouTube outreach console.
 *
 * The screen's central job is to never let "YouTube accepted this" read as
 * "this reply is live". A previous local bot conflated the two -- it checked
 * five seconds after posting and reported all 120 replies as verified, when
 * most were later gone. So the three outcomes are visually distinct here, and
 * API accepted is styled as an open question, not a success.
 *
 * There is no bulk control anywhere in this component. Post Reply acts on one
 * row, and only when an admin clicks it.
 */

export interface QueueItem extends QueueRowFacts {
  id: string;
  batch_id: string;
  spreadsheet_row: number | null;
  youtube_comment_id: string;
  video_id: string | null;
  video_title: string | null;
  channel_title: string | null;
  source_url: string | null;
  author_name: string | null;
  original_text: string | null;
  topic: string | null;
  general_reply: string | null;
  kmate_reply: string | null;
  use_kmate: boolean | null;
  best_choice: string | null;
  legacy_source: string | null;
  verified_at: string | null;
  last_verified_at: string | null;
  removed_detected_at: string | null;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
}

export interface BatchItem {
  id: string;
  label: string;
  kind: string;
  imported_at: string;
  total_rows: number;
  eligible_rows: number;
  imported_rows: number;
  already_known_rows: number;
  skipped_rows: number;
}

interface Props {
  items: QueueItem[];
  batches: BatchItem[];
  counts: Record<string, number>;
  dailyLimit: number;
  postedInWindow: number;
  minVerifyAgeHours: number;
  youtubeConfigured: boolean;
  activeStatus: string;
  activeBatch: string;
  search: string;
}

const TONE_STYLES: Record<string, string> = {
  success: "bg-success-soft text-success",
  pending: "bg-gold/10 text-gold",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-canvas text-muted",
};

function StatusChip({ status }: { status: YoutubeReplyStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_STYLES[statusTone(status)]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

const REFUSAL_TEXT: Record<string, string> = {
  terminal: "Removed by YouTube — terminal, never reposted",
  legacy: "Already replied to by the old bot",
  already_posted: "Already posted",
  not_top_level: "Nested reply — not a top-level comment",
  action_not_post: "Sheet action is not POST",
  no_draft: "No draft text",
  in_flight: "A post attempt is in flight",
};

export function YoutubeOutreach(props: Props) {
  const { items, batches, counts, dailyLimit, postedInWindow, minVerifyAgeHours } = props;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const legacyRef = useRef<HTMLInputElement>(null);

  const remaining = Math.max(0, dailyLimit - postedInWindow);
  const now = useMemo(() => new Date(), []);

  const refresh = () => window.location.reload();

  async function call(url: string, init: RequestInit, id: string, okText: string) {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await fetch(url, init);
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        const reason = typeof payload.reason === "string" ? REFUSAL_TEXT[payload.reason] : null;
        const detail = typeof payload.detail === "string" ? payload.detail : null;
        setMessage({
          tone: "error",
          text: reason ?? detail ?? String(payload.error ?? `Request failed (${response.status})`),
        });
        return;
      }

      setMessage({ tone: "ok", text: okText });
      refresh();
    } catch {
      setMessage({ tone: "error", text: "The request could not be completed." });
    } finally {
      setBusyId(null);
    }
  }

  function decide(item: QueueItem, action: string) {
    return call(
      `/api/admin/youtube/queue/${item.id}/decide`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
      item.id,
      action === "approve" ? "Approved. It still needs an explicit Post Reply." : "Updated."
    );
  }

  function saveDraft(item: QueueItem) {
    const draft = drafts[item.id];
    if (draft === undefined) return;
    return call(
      `/api/admin/youtube/queue/${item.id}/decide`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit_draft", draft }),
      },
      item.id,
      "Draft saved."
    );
  }

  async function post(item: QueueItem) {
    const preview = resolveDraft(item).slice(0, 160);
    const confirmed = window.confirm(
      `Post this reply to YouTube now?\n\nTo: ${item.author_name ?? "unknown"}\n\n${preview}${
        resolveDraft(item).length > 160 ? "…" : ""
      }\n\nThis publishes a real reply. It cannot be unsent from KMate.`
    );
    if (!confirmed) return;

    await call(
      `/api/admin/youtube/queue/${item.id}/post`,
      { method: "POST" },
      item.id,
      "YouTube accepted the reply. That is not confirmation it is live — verify later."
    );
  }

  function verify(item: QueueItem) {
    return call(
      `/api/admin/youtube/queue/${item.id}/verify`,
      { method: "POST" },
      item.id,
      "Checked against YouTube."
    );
  }

  async function upload(kind: "xlsx" | "legacy") {
    const input = kind === "xlsx" ? fileRef.current : legacyRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setMessage({ tone: "warn", text: "Choose a file first." });
      return;
    }
    const body = new FormData();
    body.append("file", file);

    await call(
      kind === "xlsx" ? "/api/admin/youtube/import" : "/api/admin/youtube/import-legacy",
      { method: "POST", body },
      "upload",
      kind === "xlsx" ? "Spreadsheet imported." : "Legacy history imported — none of it is postable."
    );
  }

  return (
    <div className="space-y-5">
      {!props.youtubeConfigured && (
        <Card className="border-gold/40 bg-gold/5 p-4">
          <p className="text-[13px] text-ink">
            YouTube OAuth is not configured in this environment. Importing and reviewing work; posting
            and verification will fail until <code>YOUTUBE_CLIENT_ID</code>,{" "}
            <code>YOUTUBE_CLIENT_SECRET</code>, <code>YOUTUBE_REFRESH_TOKEN</code> and{" "}
            <code>YOUTUBE_CHANNEL_ID</code> are set. Posting refuses to run without the channel id
            rather than publishing to an unverified account.
          </p>
        </Card>
      )}

      {message && (
        <div
          className={`rounded-xl px-4 py-3 text-[13px] ${
            message.tone === "ok"
              ? "bg-success-soft text-success"
              : message.tone === "warn"
                ? "bg-gold/10 text-gold"
                : "bg-danger-soft text-danger"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ---- import ---- */}
      <Card className="p-4">
        <h2 className="text-[15px] font-semibold text-ink">Import</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-[12.5px] font-medium text-ink">Spreadsheet (.xlsx)</label>
            <p className="mt-0.5 text-[12px] text-muted">
              The header row is detected automatically. Rows arrive as drafts, never approved.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="mt-2 block w-full text-[12.5px] text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-[12.5px] file:text-ink"
            />
            <Button
              className="mt-2"
              variant="secondary"
              disabled={busyId === "upload"}
              onClick={() => upload("xlsx")}
            >
              {busyId === "upload" ? "Importing…" : "Import spreadsheet"}
            </Button>
          </div>

          <div>
            <label className="text-[12.5px] font-medium text-ink">
              Legacy history (posted_replies.json)
            </label>
            <p className="mt-0.5 text-[12px] text-muted">
              One-time. Marks comments the old bot already replied to so they can never be posted
              again.
            </p>
            <input
              ref={legacyRef}
              type="file"
              accept=".json"
              className="mt-2 block w-full text-[12.5px] text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-[12.5px] file:text-ink"
            />
            <Button
              className="mt-2"
              variant="secondary"
              disabled={busyId === "upload"}
              onClick={() => upload("legacy")}
            >
              Import legacy history
            </Button>
          </div>
        </div>

        {batches.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Batch</th>
                  <th className="py-1 pr-3 font-medium">Imported</th>
                  <th className="py-1 pr-3 font-medium">Rows</th>
                  <th className="py-1 pr-3 font-medium">Eligible</th>
                  <th className="py-1 pr-3 font-medium">New</th>
                  <th className="py-1 pr-3 font-medium">Already known</th>
                </tr>
              </thead>
              <tbody className="text-ink">
                {batches.map((b) => (
                  <tr key={b.id} className="border-t border-hairline">
                    <td className="py-1.5 pr-3">
                      {b.label}
                      {b.kind === "legacy" && <span className="ml-1 text-muted">(legacy)</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-muted">{formatWhen(b.imported_at)}</td>
                    <td className="py-1.5 pr-3">{b.total_rows}</td>
                    <td className="py-1.5 pr-3">{b.eligible_rows}</td>
                    <td className="py-1.5 pr-3">{b.imported_rows}</td>
                    <td className="py-1.5 pr-3">{b.already_known_rows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---- counts + cap ---- */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {YOUTUBE_STATUSES.filter((s) => counts[s]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <StatusChip status={s} />
              <span className="text-[12.5px] text-ink">{counts[s]}</span>
            </span>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] text-muted">
          {postedInWindow} of {dailyLimit} replies posted in the last 24 hours —{" "}
          <span className="text-ink">{remaining} remaining</span>. Posting is one row at a time and
          always requires a click; there is no bulk action.
        </p>
      </Card>

      {/* ---- filters ---- */}
      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[12px] text-muted">Status</label>
            <select
              name="status"
              defaultValue={props.activeStatus}
              className="mt-1 rounded-lg border border-hairline bg-surface px-2 py-1.5 text-[13px] text-ink"
            >
              <option value="">All</option>
              {YOUTUBE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-muted">Batch</label>
            <select
              name="batch"
              defaultValue={props.activeBatch}
              className="mt-1 rounded-lg border border-hairline bg-surface px-2 py-1.5 text-[13px] text-ink"
            >
              <option value="">All</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="block text-[12px] text-muted">Search</label>
            <input
              name="q"
              defaultValue={props.search}
              placeholder="author, question, video, draft"
              className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-1.5 text-[13px] text-ink"
            />
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>
      </Card>

      {/* ---- queue ---- */}
      {items.length === 0 ? (
        <Card className="p-6">
          <p className="text-[13.5px] text-muted">Nothing matches these filters.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const draft = drafts[item.id] ?? resolveDraft(item);
            const refusal = approveRefusal(item);
            const isOpen = expanded === item.id;
            const busy = busyId === item.id;
            const verifiable = canVerify(item, now, minVerifyAgeHours);
            const age = hoursSince(item.api_accepted_at);

            return (
              <Card key={item.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip status={item.status} />
                      {item.is_legacy && (
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] italic text-muted">
                          legacy — old bot
                        </span>
                      )}
                      <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-ink">
                        {item.best_choice === "KMate" || item.use_kmate ? "KMate" : "General"}
                      </span>
                      {item.source_type !== "comment" && (
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] italic text-muted">
                          nested reply
                        </span>
                      )}
                      {item.automation_action && item.automation_action !== "POST" && (
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted">
                          sheet: {item.automation_action}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[13.5px] font-medium text-ink">
                      {item.author_name ?? "Unknown author"}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {item.video_title ?? item.video_id ?? "Unknown video"}
                      {item.spreadsheet_row ? ` · row ${item.spreadsheet_row}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    className="text-[12.5px] text-muted underline underline-offset-2"
                  >
                    {isOpen ? "Hide" : "Details"}
                  </button>
                </div>

                {item.original_text && (
                  <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[13px] leading-relaxed text-ink">
                    {item.original_text}
                  </p>
                )}

                {/* Posting outcome, stated in three distinct ways. */}
                {item.posted_reply_id && (
                  <div className="mt-3 rounded-lg border border-hairline px-3 py-2 text-[12px]">
                    <p className="text-muted">
                      Reply id <code className="text-ink">{item.posted_reply_id}</code>
                    </p>
                    <p className="mt-1 text-muted">
                      API accepted {formatWhen(item.api_accepted_at)}
                      {item.status === "API_ACCEPTED" && (
                        <span className="text-gold"> · not yet confirmed live</span>
                      )}
                    </p>
                    {item.verified_at && (
                      <p className="mt-1 text-success">
                        Verified live {formatWhen(item.verified_at)}
                        {item.last_verified_at !== item.verified_at &&
                          ` · last checked ${formatWhen(item.last_verified_at)}`}
                      </p>
                    )}
                    {item.removed_detected_at && (
                      <p className="mt-1 text-danger">
                        Removed — detected {formatWhen(item.removed_detected_at)}. Terminal; this is
                        never reposted.
                      </p>
                    )}
                  </div>
                )}

                {item.last_error && (
                  <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[12px] text-danger">
                    {item.status === "POSTING"
                      ? "Post outcome unknown — check YouTube before releasing this row: "
                      : "Last error: "}
                    {item.last_error}
                    {item.attempt_count > 0 && ` (attempt ${item.attempt_count})`}
                  </p>
                )}

                {isOpen && (
                  <div className="mt-3 space-y-2 text-[12.5px]">
                    {item.source_url && (
                      <p>
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted underline underline-offset-2"
                        >
                          Open source video
                        </a>
                      </p>
                    )}
                    {item.general_reply && (
                      <div>
                        <p className="text-muted">General reply</p>
                        <p className="text-ink">{item.general_reply}</p>
                      </div>
                    )}
                    {item.kmate_reply && (
                      <div>
                        <p className="text-muted">KMate reply</p>
                        <p className="text-ink">{item.kmate_reply}</p>
                      </div>
                    )}
                    <p className="text-muted">
                      Comment id <code>{item.youtube_comment_id}</code>
                      {item.legacy_source && ` · legacy source ${item.legacy_source}`}
                    </p>
                  </div>
                )}

                {/* ---- draft ---- */}
                <div className="mt-3">
                  <label className="text-[12px] text-muted">Final draft</label>
                  {canEditDraft(item) ? (
                    <>
                      <textarea
                        value={draft}
                        rows={4}
                        onChange={(e) => setDrafts({ ...drafts, [item.id]: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-[13px] leading-relaxed text-ink"
                      />
                      {drafts[item.id] !== undefined && drafts[item.id] !== resolveDraft(item) && (
                        <Button
                          className="mt-1"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => saveDraft(item)}
                        >
                          Save draft
                        </Button>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap rounded-lg bg-canvas px-3 py-2 text-[13px] leading-relaxed text-ink">
                      {draft || "—"}
                    </p>
                  )}
                </div>

                {/* ---- actions ---- */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canPost(item) && (
                    <Button disabled={busy || remaining === 0} onClick={() => post(item)}>
                      {busy ? "Posting…" : "Post Reply"}
                    </Button>
                  )}

                  {refusal === null && item.status !== "APPROVED" && (
                    <Button variant="secondary" disabled={busy} onClick={() => decide(item, "approve")}>
                      Approve
                    </Button>
                  )}

                  {canHoldOrSkip(item) && (
                    <>
                      <Button variant="ghost" disabled={busy} onClick={() => decide(item, "hold")}>
                        Hold
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={() => decide(item, "skip")}>
                        Skip
                      </Button>
                    </>
                  )}

                  {canMarkFailed(item) && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => decide(item, "mark_failed")}
                    >
                      Release stuck attempt
                    </Button>
                  )}

                  {item.posted_reply_id && item.status !== "REMOVED" && (
                    <Button variant="secondary" disabled={busy || !verifiable} onClick={() => verify(item)}>
                      {item.status === "VERIFIED_LIVE" ? "Re-check" : "Verify"}
                    </Button>
                  )}

                  {refusal && item.status !== "APPROVED" && (
                    <span className="text-[12px] text-muted">{REFUSAL_TEXT[refusal]}</span>
                  )}

                  {item.posted_reply_id && !verifiable && item.status === "API_ACCEPTED" && (
                    <span className="text-[12px] text-muted">
                      {age === null
                        ? `Verifiable after ${minVerifyAgeHours}h`
                        : `Verifiable in ${Math.max(1, Math.ceil(minVerifyAgeHours - age))}h — checking sooner proves nothing`}
                    </span>
                  )}

                  {canPost(item) && remaining === 0 && (
                    <span className="text-[12px] text-muted">Daily cap reached</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
