"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  MOCK_INTERVIEW_CATEGORIES,
  MOCK_INTERVIEW_CATEGORY_LABELS,
  PAUSE_DURATION_OPTIONS,
  getMaxMidInterviewPauses,
  type MockInterviewCategory,
} from "@/lib/mock-interview/constants";

const QUESTION_COUNT_OPTIONS = [3, 5, 7] as const;

export interface SetupChoices {
  category: MockInterviewCategory;
  questionCount: number;
  prepPauseSecs: number;
  skipPrepPause: boolean;
}

export function SetupStage({
  onContinue,
  errorMessage,
  requesting,
}: {
  onContinue: (choices: SetupChoices) => void;
  errorMessage: string | null;
  requesting: boolean;
}) {
  const [category, setCategory] = useState<MockInterviewCategory>("all");
  const [questionCount, setQuestionCount] = useState(5);
  const [prepPauseSecs, setPrepPauseSecs] = useState(30);
  const [skipPrepPause, setSkipPrepPause] = useState(false);

  const maxPauses = getMaxMidInterviewPauses(questionCount);

  return (
    <Card className="mt-4">
      <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-primary">
        Step 1
      </span>
      <h3 className="mt-2.5 text-[15px] font-semibold text-ink">Set up your interview</h3>
      <p className="mt-1 text-[13.5px] text-muted">
        Pick a category, number of questions, and how long you&apos;d like before we start.
      </p>

      <div className="mt-5">
        <label className="mb-1.5 block text-[13px] font-medium text-muted" htmlFor="category-select">
          Question category
        </label>
        <select
          id="category-select"
          value={category}
          onChange={(e) => setCategory(e.target.value as MockInterviewCategory)}
          className="w-full rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-[14px] text-ink"
        >
          {MOCK_INTERVIEW_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {MOCK_INTERVIEW_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-[13px] font-medium text-muted" htmlFor="qcount-select">
          Number of questions
        </label>
        <select
          id="qcount-select"
          value={questionCount}
          onChange={(e) => setQuestionCount(parseInt(e.target.value, 10))}
          className="w-full rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-[14px] text-ink"
        >
          {QUESTION_COUNT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} questions
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-[13px] font-medium text-muted">Prep pause before starting</label>
        <div className="flex gap-2">
          {PAUSE_DURATION_OPTIONS.map((secs) => (
            <button
              key={secs}
              type="button"
              onClick={() => {
                setSkipPrepPause(false);
                setPrepPauseSecs(secs);
              }}
              className={cn(
                "flex-1 rounded-lg border border-hairline-strong bg-surface py-2 text-[13.5px] font-medium text-ink",
                !skipPrepPause && prepPauseSecs === secs && "border-primary bg-primary-soft text-primary"
              )}
            >
              {secs}s
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSkipPrepPause(true)}
            className={cn(
              "flex-1 rounded-lg border border-dashed border-hairline-strong bg-transparent py-2 text-[13.5px] font-medium text-muted",
              skipPrepPause && "border-solid border-muted bg-canvas text-ink"
            )}
          >
            Skip
          </button>
        </div>
        <p className="mt-2 text-[13px] text-muted">
          You&apos;ll also get {maxPauses} short pause{maxPauses === 1 ? "" : "s"} to use anytime during the
          interview, if you need a break.
        </p>
      </div>

      {errorMessage && (
        <div className="mt-3 rounded-lg bg-danger-soft px-3.5 py-3 text-[13px] text-danger">{errorMessage}</div>
      )}

      <div className="mt-5 flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={requesting}
          onClick={() => onContinue({ category, questionCount, prepPauseSecs, skipPrepPause })}
          className="rounded-lg bg-primary px-5 py-2.5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {requesting ? "Requesting camera…" : "Continue → enable camera"}
        </button>
      </div>
    </Card>
  );
}
