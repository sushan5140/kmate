"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDayShort, type DayString } from "@/lib/youtube/day-window";
import { PROMOTION_LABELS, type PromotionCategory } from "@/lib/youtube/classify";

/**
 * The Today layer: what happened today, what is allowed to happen next, and
 * how the last few days actually turned out.
 *
 * Every figure here is derived from timestamps by the server -- no day-scoped
 * copies of rows exist. The archive cards are a view of the same queue, not a
 * separate history.
 *
 * The two numbers this panel exists to keep honest, side by side:
 * replies SENT today, and replies CONFIRMED still live. They are never merged
 * into a single "success" figure.
 */

export interface DailySummaryView {
  day: DayString;
  discovered: number;
  approved: number;
  posted: number;
  apiAccepted: number;
  verifiedLive: number;
  removed: number;
  hold: number;
  skip: number;
  pending: number;
  carriedIn: number;
  byVoice: { kmate: number; general: number };
  byOpportunity: { gks: number; general: number };
  byPromotion: Record<PromotionCategory, number>;
}

export interface SurvivalView {
  checked: number;
  live: number;
  awaitingCheck: number;
  rate: number | null;
}

export interface ChannelStatView {
  channel: string;
  opportunities: number;
  posted: number;
  verifiedLive: number;
  removed: number;
  survivalRate: number | null;
}

export interface AllowanceView {
  limit: number;
  dayUsed: number;
  dayRemaining: number;
  rollingUsed: number;
  rollingRemaining: number;
  effectiveRemaining: number;
  eligible: number;
  maxBatch: number;
}

interface Props {
  summary: DailySummaryView;
  archive: DailySummaryView[];
  archiveNotes: Record<string, string>;
  survival: SurvivalView;
  survivalByVoice: { kmate: SurvivalView; general: SurvivalView };
  survivalByPromotion: Record<PromotionCategory, SurvivalView>;
  channels: ChannelStatView[];
  allowance: AllowanceView;
  note: string;
  timeZone: string;
  scope: string;
  isToday: boolean;
  postingEnabled: boolean;
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div className="min-w-[76px]">
      <p className={`text-[19px] font-semibold leading-none ${tone ?? "text-ink"}`}>{value}</p>
      <p className="mt-1 text-[11.5px] leading-tight text-muted">{label}</p>
    </div>
  );
}

function percent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export function YoutubeDaily(props: Props) {
  const { summary, allowance } = props;
  const [note, setNote] = useState(props.note);
  const [savingNote, setSavingNote] = useState(false);
  const [batchSize, setBatchSize] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  // The rolling window is the binding constraint whenever it is stricter than
  // the calendar day -- the midnight-reset case, surfaced rather than hidden.
  const backstopBinds = allowance.rollingRemaining < allowance.dayRemaining;
  const presets = [1, 2, 3, 5].filter((n) => n <= Math.max(1, allowance.maxBatch));
  const selected = Math.min(batchSize, allowance.maxBatch);

  async function saveNote() {
    setSavingNote(true);
    try {
      await fetch("/api/admin/youtube/daily-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: summary.day, note }),
      });
      setResult("Note saved.");
    } finally {
      setSavingNote(false);
    }
  }

  async function postSelectedBatch() {
    if (selected < 1) return;
    const confirmed = window.confirm(
      `Post ${selected} ${selected === 1 ? "reply" : "replies"} to YouTube now?\n\n` +
        `Daily usage would become ${allowance.dayUsed + selected} / ${allowance.limit}.\n\n` +
        "These are real replies, sent one at a time. They cannot be unsent from KMate."
    );
    if (!confirmed) return;

    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/youtube/post-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: selected }),
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        setResult(String(payload.detail ?? payload.error ?? `Failed (${response.status})`));
        return;
      }

      const stopped = payload.stopped_reason
        ? ` Stopped: ${String(payload.stopped_reason).replace(/_/g, " ")}.`
        : "";
      setResult(
        `${payload.posted} accepted, ${payload.skipped} skipped, ${payload.failed} failed.${stopped} ` +
          "Accepted is not confirmed live — verify after the window."
      );
      window.location.reload();
    } catch {
      setResult("The batch request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ---- today strip ---- */}
      <Card className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ink">
            {props.isToday ? "Today" : formatDayShort(summary.day)}
          </h2>
          <span className="text-[11.5px] text-muted">
            {summary.day} · {props.timeZone}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
          <Stat value={summary.discovered} label="discovered" />
          <Stat value={summary.approved} label="approved" />
          <Stat value={summary.posted} label="posted" />
          <Stat value={summary.verifiedLive} label="verified live" tone="text-success" />
          <Stat value={summary.apiAccepted} label="awaiting check" tone="text-gold" />
          <Stat value={summary.removed} label="removed" tone="text-danger" />
          <Stat value={summary.hold} label="hold" />
          <Stat value={summary.skip} label="skip" />
          <Stat value={summary.pending} label="pending" />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-hairline pt-3 text-[12px] text-muted">
          <span>
            Posted as <span className="text-ink">{summary.byVoice.kmate} KMate</span> ·{" "}
            <span className="text-ink">{summary.byVoice.general} General</span>
          </span>
          <span>
            Questions <span className="text-ink">{summary.byOpportunity.gks} GKS</span> ·{" "}
            <span className="text-ink">{summary.byOpportunity.general} general</span>
          </span>
          <span>
            {(Object.keys(PROMOTION_LABELS) as PromotionCategory[])
              .map((c) => `${summary.byPromotion[c] ?? 0} ${PROMOTION_LABELS[c].toLowerCase()}`)
              .join(" · ")}
          </span>
          {summary.carriedIn > 0 && (
            <span className="text-ink">{summary.carriedIn} carried in from earlier days</span>
          )}
        </div>
      </Card>

      {/* ---- survival ---- */}
      <Card className="p-4">
        <h2 className="text-[15px] font-semibold text-ink">Survival after verification</h2>
        <p className="mt-1 text-[12px] text-muted">
          Only replies actually re-checked after the verification window count. Accepted-but-unchecked
          replies are excluded from both halves — they are unknown, not survivors and not casualties.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-6">
          <div>
            <p className="text-[26px] font-semibold leading-none text-ink">
              {percent(props.survival.rate)}
            </p>
            <p className="mt-1 text-[12px] text-muted">
              {props.survival.live} / {props.survival.checked} still live
              {props.survival.awaitingCheck > 0 && (
                <span className="text-gold"> · {props.survival.awaitingCheck} awaiting check</span>
              )}
            </p>
          </div>
          <div className="text-[12px] text-muted">
            <p>
              KMate <span className="text-ink">{percent(props.survivalByVoice.kmate.rate)}</span> (
              {props.survivalByVoice.kmate.live}/{props.survivalByVoice.kmate.checked})
            </p>
            <p>
              General <span className="text-ink">{percent(props.survivalByVoice.general.rate)}</span> (
              {props.survivalByVoice.general.live}/{props.survivalByVoice.general.checked})
            </p>
          </div>
          <div className="text-[12px] text-muted">
            {(Object.keys(PROMOTION_LABELS) as PromotionCategory[]).map((c) => (
              <p key={c}>
                {PROMOTION_LABELS[c]}{" "}
                <span className="text-ink">{percent(props.survivalByPromotion[c]?.rate ?? null)}</span> (
                {props.survivalByPromotion[c]?.live ?? 0}/{props.survivalByPromotion[c]?.checked ?? 0})
              </p>
            ))}
          </div>
        </div>
      </Card>

      {/* ---- batch posting ---- */}
      <Card className="p-4">
        <h2 className="text-[15px] font-semibold text-ink">Post batch</h2>

        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[12.5px]">
          <span className="text-muted">
            Daily usage{" "}
            <span className="text-ink">
              {allowance.dayUsed} / {allowance.limit}
            </span>
          </span>
          <span className="text-muted">
            Today remaining <span className="text-ink">{allowance.dayRemaining}</span>
          </span>
          <span className="text-muted">
            24h safety remaining <span className="text-ink">{allowance.rollingRemaining}</span>
          </span>
          <span className="text-muted">
            Effective remaining{" "}
            <span className={backstopBinds ? "text-gold" : "text-ink"}>
              {allowance.effectiveRemaining}
            </span>
          </span>
          <span className="text-muted">
            Eligible approved <span className="text-ink">{allowance.eligible}</span>
          </span>
          <span className="text-muted">
            Max batch now <span className="text-ink">{allowance.maxBatch}</span>
          </span>
        </div>

        {backstopBinds && (
          <p className="mt-2 rounded-lg bg-gold/10 px-3 py-2 text-[12px] text-gold">
            The rolling 24-hour backstop is stricter than today&apos;s allowance right now. Replies
            sent late yesterday still occupy slots until they age out, so only{" "}
            {allowance.effectiveRemaining} may be sent — not {allowance.dayRemaining}.
          </p>
        )}

        {allowance.maxBatch === 0 ? (
          <p className="mt-3 text-[12.5px] text-muted">
            {allowance.effectiveRemaining === 0
              ? backstopBinds
                ? `The rolling 24-hour backstop of ${allowance.limit} is full. Slots free up as replies sent in the last 24 hours age out — the calendar day resetting at midnight ${props.timeZone} does not release them.`
                : `The daily ceiling of ${allowance.limit} has been reached. It resets at midnight ${props.timeZone}.`
              : "No approved rows are eligible to post right now."}
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {presets.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setBatchSize(n)}
                  className={`h-8 w-9 rounded-lg border text-[13px] ${
                    selected === n
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-hairline bg-surface text-ink"
                  }`}
                >
                  {n}
                </button>
              ))}
              <label className="ml-2 flex items-center gap-2 text-[12.5px] text-muted">
                Custom
                <input
                  type="number"
                  min={1}
                  max={allowance.maxBatch}
                  value={selected}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="h-8 w-16 rounded-lg border border-hairline bg-surface px-2 text-[13px] text-ink"
                />
              </label>
              <span className="text-[12.5px] text-muted">
                Selected batch <span className="text-ink">{selected}</span>
              </span>
            </div>

            <Button
              className="mt-3"
              disabled={busy || selected < 1 || !props.postingEnabled}
              onClick={postSelectedBatch}
            >
              {busy ? "Posting…" : `Post selected batch (${selected})`}
            </Button>

            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              Sent one at a time, in priority order, only when you click. The run stops immediately if
              any reply&apos;s outcome is unknown. Nothing is retried automatically, and the server
              re-checks every row against the ceiling before each send.
            </p>
          </>
        )}

        {result && <p className="mt-3 text-[12.5px] text-ink">{result}</p>}
      </Card>

      {/* ---- daily note ---- */}
      <Card className="p-4">
        <h2 className="text-[15px] font-semibold text-ink">
          Note for {props.isToday ? "today" : formatDayShort(summary.day)}
        </h2>
        <p className="mt-1 text-[11.5px] text-muted">
          A reminder to yourself. Nothing in the posting rules reads this.
        </p>
        <textarea
          value={note}
          rows={2}
          placeholder="Keep links off today · Focus on GKS-U · Only high priority"
          onChange={(e) => setNote(e.target.value)}
          className="mt-2 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-[13px] text-ink"
        />
        <Button className="mt-2" variant="secondary" disabled={savingNote} onClick={saveNote}>
          {savingNote ? "Saving…" : "Save note"}
        </Button>
      </Card>

      {/* ---- previous days ---- */}
      {props.archive.length > 0 && (
        <Card className="p-4">
          <h2 className="text-[15px] font-semibold text-ink">Previous days</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {props.archive.map((day) => (
              <div key={day.day} className="rounded-xl border border-hairline p-3">
                <div className="flex items-baseline justify-between">
                  <a
                    href={`?scope=${day.day}`}
                    className="text-[13px] font-medium text-ink underline-offset-2 hover:underline"
                    onMouseEnter={() => setOpenDay(day.day)}
                    onFocus={() => setOpenDay(day.day)}
                  >
                    {formatDayShort(day.day)}
                  </a>
                  {props.archiveNotes[day.day] && (
                    <span className="max-w-[55%] truncate text-[11px] italic text-muted">
                      {props.archiveNotes[day.day]}
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-0.5 text-[11.5px] text-muted">
                  <p>{day.discovered} discovered</p>
                  <p>{day.posted} posted</p>
                  <p className="text-success">{day.verifiedLive} verified live</p>
                  {day.removed > 0 && <p className="text-danger">{day.removed} removed</p>}
                  <p>
                    {day.byVoice.kmate} KMate · {day.byVoice.general} General
                  </p>
                </div>
              </div>
            ))}
          </div>
          {openDay && (
            <p className="mt-2 text-[11.5px] text-muted">
              Click a date to open that day&apos;s rows.
            </p>
          )}
        </Card>
      )}

      {/* ---- channels ---- */}
      {props.channels.length > 0 && (
        <Card className="p-4">
          <h2 className="text-[15px] font-semibold text-ink">By source channel</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Channel</th>
                  <th className="py-1 pr-3 font-medium">Opportunities</th>
                  <th className="py-1 pr-3 font-medium">Posted</th>
                  <th className="py-1 pr-3 font-medium">Live</th>
                  <th className="py-1 pr-3 font-medium">Removed</th>
                  <th className="py-1 pr-3 font-medium">Survival</th>
                </tr>
              </thead>
              <tbody className="text-ink">
                {props.channels.map((c) => (
                  <tr key={c.channel} className="border-t border-hairline">
                    <td className="max-w-[220px] truncate py-1.5 pr-3">{c.channel}</td>
                    <td className="py-1.5 pr-3">{c.opportunities}</td>
                    <td className="py-1.5 pr-3">{c.posted}</td>
                    <td className="py-1.5 pr-3 text-success">{c.verifiedLive}</td>
                    <td className="py-1.5 pr-3 text-danger">{c.removed}</td>
                    <td className="py-1.5 pr-3">{percent(c.survivalRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
