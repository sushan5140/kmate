"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { selectFeedbackFrames } from "@/lib/mock-interview/select-frames";
import { getInterviewFeedback, type FeedbackResult } from "@/lib/mock-interview/gemini-feedback";
import { getRefinedAnswers, type RefineResult } from "@/lib/mock-interview/refine-answers";
import type { QuestionResult, SelectedFrame } from "@/lib/mock-interview/types";

export function ProcessingStage({
  apiKey,
  results,
  onComplete,
}: {
  apiKey: string;
  results: QuestionResult[];
  onComplete: (feedback: FeedbackResult, refine: RefineResult, frames: SelectedFrame[]) => void;
}) {
  const [statusText, setStatusText] = useState("Selecting key frames…");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const frames = selectFeedbackFrames(results);
      // Two independent calls, run sequentially rather than in parallel --
      // free-tier Gemini keys can have tight per-minute rate limits, and
      // firing both at once risked one of them coming back 429'd. A failure
      // in either one still can't block or corrupt the other; this only
      // changes the timing, not the independence.
      setStatusText("Getting delivery feedback from Gemini…");
      const feedback = await getInterviewFeedback(apiKey, results, frames);
      setStatusText("Getting a refined version of your answers…");
      const refine = await getRefinedAnswers(apiKey, results);
      onComplete(feedback, refine, frames);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="mt-4 flex flex-col items-center py-10 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <h3 className="mt-4 text-[15px] font-semibold text-ink">{statusText}</h3>
      <p className="mt-1 text-[13.5px] text-muted">This usually takes a few seconds.</p>
    </Card>
  );
}
