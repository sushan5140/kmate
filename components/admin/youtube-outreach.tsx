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
  postRefusal,
  resolveDraft,
  statusTone,
  type QueueRowFacts,
  type YoutubeReplyStatus,
} from "@/lib/youtube/queue-schema";
import {
  KMATE_FEATURES,
  PRIORITIES,
  PROMOTION_CATEGORIES,
  PROMOTION_LABELS,
  type OpportunityType,
  type Priority,
  type PromotionCategory,
} from "@/lib/youtube/classify";
import { formatDayShort, humanAge } from "@/lib/youtube/day-window";

/**
 * The YouTube outreach console.
 *
 * The screen's central job is to never let "YouTube accepted this" read as
 * "this reply is live". A previous local bot conflated the two -- it checked
 * five seconds after posting and reported all 120 replies as verified, when
 * most were later gone. So the three outcomes stay visually distinct, and
 * API accepted is styled as an open question rather than a success.
 *
 * Every control here acts on one row. Batch posting lives in the daily panel
 * and is still an explicit click; there is no select-all, no drainer, and
 * nothing on this page posts without a confirmation.
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
  discovered_at: string | null;
  comment_posted_at: string | null;
  priority: Priority;
  opportunity_type: OpportunityType | null;
  promotion_category: PromotionCategory;
  feature_tags: string[] | null;
  /** Derived server-side: the day this row first appeared, if before the view. */
  carried_from: string | null;
  /** Warning only. Never blocks a post. */
  author_previous: number;
  author_last_replied_at: string | null;
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

export interface FilterState {
  scope: string;
  status: string;
  batch: string;
  priority: string;
  opportunity: string;
  promotion: string;
  feature: string;
  channel: string;
  followUp: string;
  legacy: string;
  sort: string;
  q: string;
}

interface Props {
  items: QueueItem[];
  batches: BatchItem[];
  channels: string[];
  counts: Record<string, number>;
  minVerifyAgeHours: number;
  youtubeConfigured: boolean;
  filters: FilterState;
}

const TONE_STYLES: Record<string, string> = {
  success: "bg-success-soft text-success",
  pending: "bg-gold/10 text-gold",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-canvas text-muted",
};

const PRIORITY_STYLES: Record<Priority, string> = {
  HIGH: "bg-danger-soft text-danger",
  MEDIUM: "bg-canvas text-ink",
  LOW: "bg-canvas text-muted",
};

function StatusChip({ status }: { status: YoutubeReplyStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_STYLES[statusTone(status)]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ${className || "bg-canvas text-muted"}`}>
      {children}
    </span>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

const REFUSAL_TEXT: Record<string, string> = {
  terminal: "Removed by YouTube — terminal, never reposted",
  legacy: "Already replied to by the old bot",
  already_posted: "Already posted",
  not_top_level: "Nested reply — not a top-level comment",
  action_not_post: "Sheet action is not POST",
  no_draft: "No draft text",
  in_flight: "A post attempt is in flight",
  not_approved: "Not approved yet",
  manual_follow_up: "Marked for manual follow-up — excluded from posting",
};

export function YoutubeOutreach(props: Props) {
  const { items, batches, counts, minVerifyAgeHours, filters } = props;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const legacyRef = useRef<HTMLInputElement>(null);

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

  const decide = (item: QueueItem, payload: Record<string, unknown>, okText: string) =>
    call(
      `/api/admin/youtube/queue/${item.id}/decide`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      item.id,
      okText
    );

  function post(item: QueueItem) {
    const draft = resolveDraft(item);
    const confirmed = window.confirm(
      `Post this reply to YouTube now?\n\nTo: ${item.author_name ?? "unknown"}\n\n` +
        `${draft.slice(0, 160)}${draft.length > 160 ? "…" : ""}\n\n` +
        (item.author_previous > 0
          ? `NOTE: this author has already received ${item.author_previous} repl${item.author_previous === 1 ? "y" : "ies"}.\n\n`
          : "") +
        "This publishes a real reply. It cannot be unsent from KMate."
    );
    if (!confirmed) return;
    return call(
      `/api/admin/youtube/queue/${item.id}/post`,
      { method: "POST" },
      item.id,
      "YouTube accepted the reply. That is not confirmation it is live — verify later."
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

  const select = (name: string, value: string, options: Array<[string, string]>) => (
    <select
      name={name}
      defaultValue={value}
      className="mt-1 rounded-lg border border-hairline bg-surface px-2 py-1.5 text-[13px] text-ink"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
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

      {/* ---- filters ---- */}
      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="scope" value={filters.scope} />
          <div>
            <label className="block text-[12px] text-muted">Status</label>
            {select("status", filters.status, [
              ["", "All"],
              ...YOUTUBE_STATUSES.map((s) => [s, STATUS_LABELS[s]] as [string, string]),
            ])}
          </div>
          <div>
            <label className="block text-[12px] text-muted">Priority</label>
            {select("priority", filters.priority, [
              ["", "Any"],
              ...PRIORITIES.map((p) => [p, p] as [string, string]),
            ])}
          </div>
          <div>
            <label className="block text-[12px] text-muted">Question</label>
            {select("opportunity", filters.opportunity, [
              ["", "Any"],
              ["GKS", "GKS"],
              ["GENERAL", "General"],
            ])}
          </div>
          <div>
            <label className="block text-[12px] text-muted">Reply</label>
            {select("promotion", filters.promotion, [
              ["", "Any"],
              ...PROMOTION_CATEGORIES.map((c) => [c, PROMOTION_LABELS[c]] as [string, string]),
            ])}
          </div>
          <div>
            <label className="block text-[12px] text-muted">Feature</label>
            {select("feature", filters.feature, [
              ["", "Any"],
              ...KMATE_FEATURES.map((f) => [f, f] as [string, string]),
            ])}
          </div>
          <div>
            <label className="block text-[12px] text-muted">Channel</label>
            {select("channel", filters.channel, [
              ["", "Any"],
              ...props.channels.map((c) => [c, c] as [string, string]),
            ])}
          </div>
          <div>
            <label className="block text-[12px] text-muted">Batch</label>
            {select("batch", filters.batch, [
              ["", "All"],
              ...batches.map((b) => [b.id, b.label] as [string, string]),
            ])}
          </div>
          <div>
            <label className="block text-[12px] text-muted">Follow-up</label>
            {select("followUp", filters.followUp, [
              ["", "Any"],
              ["yes", "Manual only"],
              ["no", "Exclude manual"],
            ])}
          </div>
          <div>
            <label className="block text-[12px] text-muted">Legacy</label>
            {select("legacy", filters.legacy, [
              ["", "Any"],
              ["yes", "Legacy only"],
              ["no", "Exclude legacy"],
            ])}
          </div>
          <div>
            <label className="block text-[12px] text-muted">Sort</label>
            {select("sort", filters.sort, [
              ["newest", "Newest first"],
              ["oldest", "Oldest first"],
            ])}
          </div>
          <div className="min-w-[170px] flex-1">
            <label className="block text-[12px] text-muted">Search</label>
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="author, question, video, draft"
              className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-1.5 text-[13px] text-ink"
            />
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          {YOUTUBE_STATUSES.filter((s) => counts[s]).map((s) => (
            <a key={s} href={`?scope=${filters.scope}&status=${s}`} className="flex items-center gap-1.5">
              <StatusChip status={s} />
              <span className="text-[12.5px] text-ink">{counts[s]}</span>
            </a>
          ))}
        </div>
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
            const approveBlock = approveRefusal(item);
            const postBlock = postRefusal(item);
            const isOpen = expanded === item.id;
            const busy = busyId === item.id;
            const verifiable = canVerify(item, now, minVerifyAgeHours);
            const voice = item.best_choice === "KMate" || item.use_kmate ? "KMate" : "General";

            return (
              <Card key={item.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusChip status={item.status} />
                      <Chip className={PRIORITY_STYLES[item.priority]}>{item.priority}</Chip>
                      <Chip className="bg-canvas text-ink">{voice}</Chip>
                      {item.opportunity_type && <Chip>{item.opportunity_type}</Chip>}
                      <Chip>{PROMOTION_LABELS[item.promotion_category]}</Chip>
                      {item.manual_follow_up && (
                        <Chip className="bg-gold/10 text-gold">Manual follow-up</Chip>
                      )}
                      {item.carried_from && (
                        <Chip className="bg-canvas text-ink">
                          Carried from {formatDayShort(item.carried_from)}
                        </Chip>
                      )}
                      {item.is_legacy && <Chip className="italic">legacy — old bot</Chip>}
                      {item.source_type !== "comment" && <Chip className="italic">nested reply</Chip>}
                    </div>

                    <p className="mt-2 text-[13.5px] font-medium text-ink">
                      {item.author_name ?? "Unknown author"}{" "}
                      <span
                        className="text-[12px] font-normal text-muted"
                        title={formatWhen(item.comment_posted_at ?? item.discovered_at)}
                      >
                        · {humanAge(item.comment_posted_at ?? item.discovered_at, now)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {item.channel_title ? `${item.channel_title} · ` : ""}
                      {item.video_title ?? item.video_id ?? "Unknown video"}
                    </p>

                    {item.author_previous > 0 && (
                      <p className="mt-1 text-[11.5px] text-gold">
                        Replied {humanAge(item.author_last_replied_at, now)} ago ·{" "}
                        {item.author_previous} previous interaction
                        {item.author_previous === 1 ? "" : "s"} with this author
                      </p>
                    )}
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

                {item.feature_tags && item.feature_tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted">KMate fits:</span>
                    {item.feature_tags.map((tag) => (
                      <Chip key={tag}>{tag}</Chip>
                    ))}
                  </div>
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
                      {item.spreadsheet_row ? ` · row ${item.spreadsheet_row}` : ""}
                      {item.legacy_source && ` · legacy source ${item.legacy_source}`}
                    </p>
                    <p className="text-muted">
                      Discovered {formatWhen(item.discovered_at)} · comment posted{" "}
                      {formatWhen(item.comment_posted_at)}
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
                          onClick={() => decide(item, { action: "edit_draft", draft: drafts[item.id] }, "Draft saved.")}
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
                    <Button disabled={busy} onClick={() => post(item)}>
                      {busy ? "Posting…" : "Post Reply"}
                    </Button>
                  )}

                  {approveBlock === null && item.status !== "APPROVED" && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => decide(item, { action: "approve" }, "Approved. It still needs an explicit post.")}
                    >
                      Approve
                    </Button>
                  )}

                  {canHoldOrSkip(item) && (
                    <>
                      <Button variant="ghost" disabled={busy} onClick={() => decide(item, { action: "hold" }, "Held.")}>
                        Hold
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={() => decide(item, { action: "skip" }, "Skipped.")}>
                        Skip
                      </Button>
                    </>
                  )}

                  {canMarkFailed(item) && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => decide(item, { action: "mark_failed" }, "Released.")}
                    >
                      Release stuck attempt
                    </Button>
                  )}

                  {item.posted_reply_id && item.status !== "REMOVED" && (
                    <Button
                      variant="secondary"
                      disabled={busy || !verifiable}
                      onClick={() =>
                        call(`/api/admin/youtube/queue/${item.id}/verify`, { method: "POST" }, item.id, "Checked against YouTube.")
                      }
                    >
                      {item.status === "VERIFIED_LIVE" ? "Re-check" : "Verify"}
                    </Button>
                  )}

                  {item.status !== "REMOVED" && !item.posted_reply_id && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        decide(
                          item,
                          { action: "set_follow_up", manual_follow_up: !item.manual_follow_up },
                          item.manual_follow_up ? "Back in the normal queue." : "Marked for manual follow-up."
                        )
                      }
                    >
                      {item.manual_follow_up ? "Unmark follow-up" : "Manual follow-up"}
                    </Button>
                  )}

                  {/* Triage: ordering and labelling only, never a safety control. */}
                  {item.status !== "REMOVED" && item.status !== "POSTING" && (
                    <select
                      value={item.priority}
                      disabled={busy}
                      onChange={(e) => decide(item, { action: "set_priority", priority: e.target.value }, "Priority updated.")}
                      className="h-8 rounded-lg border border-hairline bg-surface px-2 text-[12px] text-ink"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  )}

                  {postBlock && postBlock !== "not_approved" && (
                    <span className="text-[12px] text-muted">{REFUSAL_TEXT[postBlock]}</span>
                  )}
                  {approveBlock && item.status !== "APPROVED" && (
                    <span className="text-[12px] text-muted">{REFUSAL_TEXT[approveBlock]}</span>
                  )}
                  {item.posted_reply_id && !verifiable && item.status === "API_ACCEPTED" && (
                    <span className="text-[12px] text-muted">
                      Verifiable {minVerifyAgeHours}h after posting — checking sooner proves nothing
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
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
            <Button className="mt-2" variant="secondary" disabled={busyId === "upload"} onClick={() => upload("xlsx")}>
              {busyId === "upload" ? "Importing…" : "Import spreadsheet"}
            </Button>
          </div>
          <div>
            <label className="text-[12.5px] font-medium text-ink">Legacy history (posted_replies.json)</label>
            <p className="mt-0.5 text-[12px] text-muted">
              One-time. Marks comments the old bot already replied to so they can never be posted again.
            </p>
            <input
              ref={legacyRef}
              type="file"
              accept=".json"
              className="mt-2 block w-full text-[12.5px] text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-[12.5px] file:text-ink"
            />
            <Button className="mt-2" variant="secondary" disabled={busyId === "upload"} onClick={() => upload("legacy")}>
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
    </div>
  );
}
