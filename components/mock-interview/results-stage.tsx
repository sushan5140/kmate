"use client";

import { Card } from "@/components/ui/card";
import type { QuestionResult } from "@/lib/mock-interview/types";

export function ResultsStage({
  feedbackText,
  feedbackError,
  results,
  saveState,
  onRestart,
}: {
  feedbackText: string | null;
  feedbackError: string | null;
  results: QuestionResult[];
  saveState: "saving" | "saved" | "error";
  onRestart: () => void;
}) {
  return (
    <div className="mx-auto mt-4 flex max-w-[760px] flex-col gap-4">
      <Card>
        <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-primary">
          Feedback
        </span>
        <h3 className="mt-2.5 text-[15px] font-semibold text-ink">Delivery feedback</h3>

        {feedbackError && (
          <div className="mt-3 whitespace-pre-wrap rounded-lg bg-danger-soft px-3.5 py-3 text-[13px] text-danger">
            {feedbackError}
          </div>
        )}
        {feedbackText && (
          <div className="mt-3 whitespace-pre-wrap rounded-lg border border-hairline bg-canvas px-4 py-3.5 text-[13.5px] leading-relaxed text-ink">
            {feedbackText}
          </div>
        )}

        <p className="mt-3 text-[12px] text-muted">
          {saveState === "saving" && "Saving this session to your history…"}
          {saveState === "saved" && "Saved to your interview history."}
          {saveState === "error" &&
            "Couldn't save this session to your history — your feedback above is still valid, it just won't appear in past sessions."}
        </p>
      </Card>

      {results.map((r, i) => (
        <Card key={i}>
          <h4 className="text-[14px] font-semibold text-ink">
            Q{i + 1}: {r.question}
          </h4>
          <div className="mt-2 max-h-[100px] overflow-y-auto rounded-lg border border-hairline bg-canvas px-3 py-2.5 text-[13px] text-muted">
            {r.transcript || "(no speech captured)"}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricChip label="Eye contact" value={`${r.metrics.eyeContactPct}%`} />
            <MetricChip label="Pace" value={r.metrics.wpm ? `${r.metrics.wpm} wpm` : "—"} />
            <MetricChip label="Fillers" value={r.metrics.fillerCount} />
            <MetricChip label="Long pauses" value={r.metrics.longPauseCount} />
            <MetricChip label="Posture" value={r.metrics.postureStability ?? "—"} />
            <MetricChip label="Duration" value={`${r.metrics.durationSec}s`} />
          </div>
          {r.frameCandidates.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {r.frameCandidates.slice(0, 3).map((f, fi) => (
                // eslint-disable-next-line @next/next/no-img-element -- base64 data URLs, not a next/image use case
                <img
                  key={fi}
                  src={f.dataUrl}
                  alt=""
                  className="h-[70px] w-[93px] shrink-0 rounded-md object-cover"
                />
              ))}
            </div>
          )}
        </Card>
      ))}

      <button
        type="button"
        onClick={onRestart}
        className="self-start rounded-lg bg-primary px-5 py-2.5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-110"
      >
        Start a new interview
      </button>
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas px-3 py-2">
      <div className="text-[16px] font-bold text-ink">{value}</div>
      <div className="text-[10.5px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}
