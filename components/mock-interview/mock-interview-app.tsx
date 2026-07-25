"use client";

import { useState } from "react";
import { ApiKeyStage } from "@/components/mock-interview/api-key-stage";
import { SetupStage, type SetupChoices } from "@/components/mock-interview/setup-stage";
import { InterviewStage } from "@/components/mock-interview/interview-stage";
import { ProcessingStage } from "@/components/mock-interview/processing-stage";
import { ResultsStage } from "@/components/mock-interview/results-stage";
import { QUESTION_BANK, getMaxMidInterviewPauses, type MockInterviewCategory } from "@/lib/mock-interview/constants";
import type { FeedbackResult } from "@/lib/mock-interview/gemini-feedback";
import type { QuestionResult } from "@/lib/mock-interview/types";

type Stage = "apikey" | "setup" | "interview" | "processing" | "results";

// Camera/mic access errors, broken out by name -- NotAllowedError (denied)
// is a genuinely different situation from NotFoundError (no hardware) or
// NotReadableError (camera in use elsewhere), so each gets its own message
// rather than one generic "check your permissions".
const GET_USER_MEDIA_ERROR_MESSAGES: Record<string, string> = {
  NotAllowedError:
    "Camera/mic access was denied. Check your browser's site settings (usually the icon left of the address bar) and allow camera + microphone for this page, then try again.",
  NotFoundError: "No camera or microphone was found on this device.",
  NotReadableError: "Your camera or mic seems to be in use by another app. Close other apps using it and try again.",
  OverconstrainedError: "Your camera doesn't support the requested resolution.",
};

export function MockInterviewApp() {
  // The API key screen is the FIRST screen shown, before setup -- a
  // deliberate fix from the prototype: requesting the key upfront avoids a
  // real failure mode where a user takes a break before pasting a key and
  // loses the whole in-memory interview (nothing here persists to Supabase
  // until the end-of-interview feedback call, so losing in-memory state
  // means losing the interview entirely).
  const [stage, setStage] = useState<Stage>("apikey");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [category, setCategory] = useState<MockInterviewCategory>("all");
  const [questions, setQuestions] = useState<string[]>([]);
  const [maxMidPauses, setMaxMidPauses] = useState(2);
  const [midPausesUsed, setMidPausesUsed] = useState(0);
  const [initialPrepSecs, setInitialPrepSecs] = useState(30);
  const [finishedResults, setFinishedResults] = useState<QuestionResult[] | null>(null);
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saving");

  async function handleContinue(choices: SetupChoices) {
    setErrorMessage(null);

    // getUserMedia only works in a "secure context" -- https://, or
    // localhost. Diagnose this explicitly rather than showing a misleading
    // "check your permissions" message, since an insecure context makes the
    // browser refuse access before any permission dialog even appears --
    // that looks identical to "permission denied" from the outside.
    if (!window.isSecureContext) {
      setErrorMessage(
        "Your browser is blocking camera access because this page isn't loaded securely (it needs to be served over https://, or opened as localhost). This is a browser security rule, not a permission you can grant."
      );
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage("This browser doesn't support camera/mic access (no mediaDevices API). Try the latest Chrome.");
      return;
    }

    const pool =
      choices.category === "all"
        ? Object.values(QUESTION_BANK).flat()
        : [...QUESTION_BANK[choices.category]];
    const picked: string[] = [];
    for (let i = 0; i < choices.questionCount && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }

    setRequesting(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: true,
      });
      setStream(mediaStream);
      setCategory(choices.category);
      setQuestions(picked);
      setMaxMidPauses(getMaxMidInterviewPauses(choices.questionCount));
      setInitialPrepSecs(choices.skipPrepPause ? 0 : choices.prepPauseSecs);
      setStage("interview");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setErrorMessage(
        GET_USER_MEDIA_ERROR_MESSAGES[name] || `Camera/mic access failed (${name || "unknown error"}). Please allow access and try again.`
      );
    } finally {
      setRequesting(false);
    }
  }

  function handleFinish(results: QuestionResult[], usedPauses: number) {
    stream?.getTracks().forEach((t) => t.stop());
    setFinishedResults(results);
    setMidPausesUsed(usedPauses);
    setStage("processing");
  }

  async function handleFeedbackComplete(result: FeedbackResult, results: QuestionResult[], usedPauses: number) {
    setFeedback(result);
    setStage("results");
    setSaveState("saving");

    try {
      const res = await fetch("/api/mock-interview/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          questionCount: questions.length,
          maxMidPauses,
          midPausesUsed: usedPauses,
          status: results.length >= questions.length ? "completed" : "abandoned",
          finalFeedbackText: result.ok ? result.text : null,
          questions: results.map((r, i) => ({
            questionIndex: i,
            questionText: r.question,
            transcript: r.transcript,
            eyeContactPct: r.metrics.eyeContactPct,
            wpm: r.metrics.wpm,
            fillerCount: r.metrics.fillerCount,
            longPauseCount: r.metrics.longPauseCount,
            longestPauseSec: r.metrics.longestPauseSec,
            postureStability: r.metrics.postureStability,
            durationSec: r.metrics.durationSec,
          })),
        }),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }

  if (stage === "interview" && stream) {
    return (
      <InterviewStage
        stream={stream}
        questions={questions}
        maxMidPauses={maxMidPauses}
        initialPrepSecs={initialPrepSecs}
        onFinish={handleFinish}
      />
    );
  }

  if (stage === "processing" && finishedResults && apiKey) {
    return (
      <ProcessingStage
        apiKey={apiKey}
        results={finishedResults}
        onComplete={(result) => handleFeedbackComplete(result, finishedResults, midPausesUsed)}
      />
    );
  }

  if (stage === "results" && finishedResults) {
    return (
      <ResultsStage
        feedbackText={feedback?.ok ? feedback.text : null}
        feedbackError={feedback && !feedback.ok ? feedback.message : null}
        results={finishedResults}
        saveState={saveState}
        onRestart={() => {
          setFinishedResults(null);
          setFeedback(null);
          setStage("setup");
        }}
      />
    );
  }

  if (stage === "apikey") {
    return (
      <ApiKeyStage
        onValidated={(validatedKey) => {
          setApiKey(validatedKey);
          setStage("setup");
        }}
      />
    );
  }

  return <SetupStage onContinue={handleContinue} errorMessage={errorMessage} requesting={requesting} />;
}
