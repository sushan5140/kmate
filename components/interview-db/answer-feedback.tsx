"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

interface FeedbackDimension {
  score: number;
  note: string;
}

interface Feedback {
  clarity: FeedbackDimension;
  confidence: FeedbackDimension;
  repetition: FeedbackDimension;
  length: FeedbackDimension;
  overall_summary: string;
}

const DIMENSION_LABELS: Record<keyof Omit<Feedback, "overall_summary">, string> = {
  clarity: "Clarity",
  confidence: "Confidence",
  repetition: "Repetition",
  length: "Length",
};

function ScoreDots({ score }: { score: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={cn("h-1.5 w-1.5 rounded-full", n <= score ? "bg-primary" : "bg-ink/[0.1]")}
        />
      ))}
    </span>
  );
}

export function AnswerFeedback({ questionId, answer }: { questionId: string; answer: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const tooShort = answer.trim().length < 20;

  async function getFeedback() {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/questions/${questionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const data = await res.json();
      if (!res.ok) {
        const messages: Record<string, string> = {
          feedback_not_configured: "Feedback isn't set up yet.",
          monthly_limit_reached: "You've used your feedback for this month.",
          rate_limited: "Slow down a bit and try again shortly.",
          invalid_answer: "Write a bit more before requesting feedback.",
        };
        setErrorMessage(messages[data.error] ?? "Couldn't get feedback. Try again.");
        setStatus("error");
        return;
      }
      setFeedback(data.feedback);
      setStatus("done");
    } catch {
      setErrorMessage("Couldn't reach the server.");
      setStatus("error");
    }
  }

  if (status === "idle" || status === "error") {
    return (
      <div>
        <button
          type="button"
          onClick={getFeedback}
          disabled={tooShort}
          className="text-[12.5px] font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
        >
          Get feedback on delivery
        </button>
        {status === "error" && <p className="mt-1 text-[12px] text-red-600">{errorMessage}</p>}
      </div>
    );
  }

  if (status === "loading") {
    return <p className="text-[12.5px] text-muted">Getting feedback…</p>;
  }

  if (!feedback) return null;

  return (
    <div className="rounded-xl border border-border bg-canvas/60 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
        Delivery feedback -- not a judgment of your content
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        {(Object.keys(DIMENSION_LABELS) as (keyof typeof DIMENSION_LABELS)[]).map((key) => (
          <div key={key}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-ink">{DIMENSION_LABELS[key]}</span>
              <ScoreDots score={feedback[key].score} />
            </div>
            <p className="mt-0.5 text-[12px] leading-snug text-muted">{feedback[key].note}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-hairline pt-2 text-[12.5px] leading-relaxed text-ink">
        {feedback.overall_summary}
      </p>
    </div>
  );
}
