"use client";

import { useEffect, useRef, useState } from "react";
import {
  FRAME_SAMPLE_INTERVAL_MS,
  PAUSE_DURATION_OPTIONS,
} from "@/lib/mock-interview/constants";
import { computePostureStability, loadMediaPipeModels, nextLandmarkerTs } from "@/lib/mock-interview/mediapipe";
import type { LiveMetrics, QuestionResult, QuestionRuntime } from "@/lib/mock-interview/types";
import { cn } from "@/lib/cn";

// Filler-word / long-pause thresholds below are ported verbatim from the
// prototype (gaze deviation 0.35, brightness 60-220, blink blendshape 0.5,
// speech-gap 1.5s, frame-candidate rolling cap 12) -- not re-tuned.

function newQuestionRuntime(): QuestionRuntime {
  return {
    startTs: performance.now(),
    frameCount: 0,
    eyeContactFrames: 0,
    blinkEvents: 0,
    lastEyeState: "open",
    posePositions: [],
    lastFrameSampleTs: 0,
    frameCandidates: [],
    transcriptFinal: "",
    transcriptInterim: "",
    speechStartTs: null,
    lastSpeechTs: null,
    pauseEvents: [],
    wordCount: 0,
    fillerCount: 0,
  };
}

function formatElapsed(startTs: number): string {
  const secs = Math.floor((performance.now() - startTs) / 1000);
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

interface CheckItem {
  ok: boolean;
  label: string;
}

export function InterviewStage({
  stream,
  questions,
  maxMidPauses,
  initialPrepSecs,
  onFinish,
}: {
  stream: MediaStream;
  questions: string[];
  maxMidPauses: number;
  initialPrepSecs: number;
  onFinish: (results: QuestionResult[], midPausesUsed: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Eagerly initialized (not null) so a question can never silently fail to
  // record: Question 1's runtime used to only get created once MediaPipe
  // models finished loading (inside beginQuestionFlow -> loadQuestion(0)),
  // but "Next question" is clickable immediately on mount. Clicking during
  // that async gap hit finalizeCurrentQuestion's `if (!rt) return;` guard,
  // silently dropping Question 1 entirely and shifting every later
  // question's stored index. loadQuestion still replaces this with a fresh
  // runtime once tracking actually starts, same as for every other question.
  const rtRef = useRef<QuestionRuntime | null>(newQuestionRuntime());
  const perQuestionResultsRef = useRef<QuestionResult[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const landmarkersRef = useRef<{ faceLandmarker: any; poseLandmarker: any } | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const pausedAtTsRef = useRef<number | null>(null);
  const hasStartedFirstQuestionRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const interviewStartTsRef = useRef(0);
  const isPausedRef = useRef(false);
  // Which kind of pause is active -- read inside exitPauseMode/runEndOfPauseCheck
  // (event-handler context, refs are fine there). The render-time twin below
  // (pauseKind state) is what the JSX actually reads.
  const pauseKindRef = useRef<"initial" | "mid">("initial");

  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [midPausesUsed, setMidPausesUsed] = useState(0);
  // Lazily seeded from the initialPrepSecs prop so the get-ready pause is
  // already the correct render on first paint, instead of defaulting to
  // "none" and flipping it via a setState call inside the mount effect.
  const [pauseMode, setPauseMode] = useState<"none" | "countdown" | "check">(() =>
    initialPrepSecs > 0 ? "countdown" : "none"
  );
  const [pauseKind, setPauseKind] = useState<"initial" | "mid">("initial");
  const [pauseSecs, setPauseSecs] = useState(() => (initialPrepSecs > 0 ? initialPrepSecs : 30));
  const [countdownRemaining, setCountdownRemaining] = useState(() => (initialPrepSecs > 0 ? initialPrepSecs : 30));
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [trackingStatus, setTrackingStatus] = useState("Loading tracking…");
  const [elapsed, setElapsed] = useState("00:00");
  const [transcriptText, setTranscriptText] = useState("Listening…");
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>({
    eyeContactPct: 0,
    blinkEvents: 0,
    wpm: 0,
    fillerCount: 0,
    longPauseCount: 0,
    postureStability: null,
  });

  // ---------------------------------------------------------------
  // Speech recognition (Web Speech API)
  // ---------------------------------------------------------------
  function setupSpeechRecognition() {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      console.warn("Web Speech API not supported in this browser -- transcript will be empty. Try Chrome.");
      return;
    }
    const recognition: SpeechRecognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const rt = rtRef.current;
      if (!rt) return;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptChunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          rt.transcriptFinal += transcriptChunk + " ";
          const now = performance.now();
          if (rt.lastSpeechTs && (now - rt.lastSpeechTs) / 1000 > 1.5) {
            rt.pauseEvents.push((now - rt.lastSpeechTs) / 1000);
          }
          rt.lastSpeechTs = now;
          if (!rt.speechStartTs) rt.speechStartTs = now;
          const words = transcriptChunk.trim().split(/\s+/).filter(Boolean);
          rt.wordCount += words.length;
          rt.fillerCount += (transcriptChunk.match(/\b(um+|uh+|like|you know)\b/gi) || []).length;
        } else {
          interim += transcriptChunk;
        }
      }
      rt.transcriptInterim = interim;
      setTranscriptText((rt.transcriptFinal + " " + interim).trim() || "Listening…");
    };

    recognition.onerror = (e) => console.warn("Speech recognition error:", e.error);
    recognition.onend = () => {
      // auto-restart while this component (the interview stage) is still mounted
      if (!isPausedRef.current) {
        try {
          recognition.start();
        } catch {
          /* already started */
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------
  // Tracking loop
  // ---------------------------------------------------------------
  function trackingLoop() {
    const video = videoRef.current;
    const canvas = overlayCanvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d")!;

    function frame() {
      if (isPausedRef.current) return; // stop loop while paused; resumed explicitly on exitPauseMode
      const rt = rtRef.current;
      const { faceLandmarker, poseLandmarker } = landmarkersRef.current || {};

      if (video!.readyState >= 2 && rt && faceLandmarker && poseLandmarker) {
        try {
          const landmarkerTs = nextLandmarkerTs();
          const faceResult = faceLandmarker.detectForVideo(video, landmarkerTs);
          const poseResult = poseLandmarker.detectForVideo(video, landmarkerTs);

          ctx.clearRect(0, 0, canvas!.width, canvas!.height);
          rt.frameCount += 1;

          let gazeAwayScore = 0;

          if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
            const lm = faceResult.faceLandmarks[0];
            const noseTip = lm[1];
            const leftEyeOuter = lm[33];
            const rightEyeOuter = lm[263];

            const eyeSpan = Math.abs(rightEyeOuter.x - leftEyeOuter.x);
            const midEyeX = (rightEyeOuter.x + leftEyeOuter.x) / 2;
            const deviation = Math.abs(noseTip.x - midEyeX) / (eyeSpan || 0.01);
            gazeAwayScore = deviation;
            const lookingAtCamera = deviation < 0.35;
            if (lookingAtCamera) rt.eyeContactFrames += 1;

            if (faceResult.faceBlendshapes && faceResult.faceBlendshapes.length > 0) {
              const shapes = faceResult.faceBlendshapes[0].categories;
              const blinkL = shapes.find((s: any) => s.categoryName === "eyeBlinkLeft"); // eslint-disable-line @typescript-eslint/no-explicit-any
              const blinkR = shapes.find((s: any) => s.categoryName === "eyeBlinkRight"); // eslint-disable-line @typescript-eslint/no-explicit-any
              const avgBlink = ((blinkL?.score || 0) + (blinkR?.score || 0)) / 2;
              const eyeState = avgBlink > 0.5 ? "closed" : "open";
              if (eyeState === "closed" && rt.lastEyeState === "open") {
                rt.blinkEvents += 1;
              }
              rt.lastEyeState = eyeState;
            }

            ctx.strokeStyle = "#3E63DD";
            ctx.lineWidth = 2;
            const xs = lm.map((p: any) => p.x * canvas!.width); // eslint-disable-line @typescript-eslint/no-explicit-any
            const ys = lm.map((p: any) => p.y * canvas!.height); // eslint-disable-line @typescript-eslint/no-explicit-any
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
          }

          if (poseResult.landmarks && poseResult.landmarks.length > 0) {
            const pose = poseResult.landmarks[0];
            const leftShoulder = pose[11];
            const rightShoulder = pose[12];
            if (leftShoulder && rightShoulder) {
              rt.posePositions.push({
                x: (leftShoulder.x + rightShoulder.x) / 2,
                y: (leftShoulder.y + rightShoulder.y) / 2,
                ts: performance.now(),
              });
              if (rt.posePositions.length > 300) rt.posePositions.shift();
            }
          }

          const now = performance.now();
          if (now - rt.lastFrameSampleTs > FRAME_SAMPLE_INTERVAL_MS) {
            rt.lastFrameSampleTs = now;
            const snap = document.createElement("canvas");
            snap.width = video!.videoWidth;
            snap.height = video!.videoHeight;
            const sctx = snap.getContext("2d")!;
            sctx.drawImage(video!, 0, 0);
            rt.frameCandidates.push({
              dataUrl: snap.toDataURL("image/jpeg", 0.7),
              ts: now,
              gazeAwayScore,
            });
            if (rt.frameCandidates.length > 12) rt.frameCandidates.shift();
          }

          const eyeContactPct = rt.frameCount > 0 ? Math.round((rt.eyeContactFrames / rt.frameCount) * 100) : 0;
          const wpm = rt.speechStartTs
            ? Math.round(rt.wordCount / (((performance.now() - rt.speechStartTs) / 1000 / 60) || 1))
            : 0;
          setLiveMetrics({
            eyeContactPct,
            blinkEvents: rt.blinkEvents,
            wpm,
            fillerCount: rt.fillerCount,
            longPauseCount: rt.pauseEvents.length,
            postureStability: computePostureStability(rt.posePositions),
          });
        } catch (err) {
          console.error("Tracking error:", err);
        }
      }

      setElapsed(formatElapsed(interviewStartTsRef.current));
      rafIdRef.current = requestAnimationFrame(frame);
    }
    rafIdRef.current = requestAnimationFrame(frame);
  }

  function loadQuestion(idx: number) {
    setCurrentQIndex(idx);
    setTranscriptText("Listening…");
    rtRef.current = newQuestionRuntime();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          recognitionRef.current?.start();
        } catch {
          /* ignore */
        }
      }, 250);
    }
  }

  function beginQuestionFlow() {
    interviewStartTsRef.current = performance.now();
    hasStartedFirstQuestionRef.current = true;
    loadQuestion(0);
    trackingLoop();
  }

  function finalizeCurrentQuestion() {
    const rt = rtRef.current;
    if (!rt) return;
    const eyeContactPct = rt.frameCount > 0 ? Math.round((rt.eyeContactFrames / rt.frameCount) * 100) : 0;
    const durationSec = (performance.now() - rt.startTs) / 1000;
    const wpm = rt.wordCount > 0 ? Math.round(rt.wordCount / (durationSec / 60)) : 0;
    const stability = computePostureStability(rt.posePositions);

    perQuestionResultsRef.current.push({
      question: questions[currentQIndex],
      transcript: rt.transcriptFinal.trim(),
      metrics: {
        eyeContactPct,
        blinkEvents: rt.blinkEvents,
        wpm,
        fillerCount: rt.fillerCount,
        longPauseCount: rt.pauseEvents.length,
        longestPauseSec: rt.pauseEvents.length ? Math.max(...rt.pauseEvents) : 0,
        postureStability: stability,
        durationSec: Math.round(durationSec),
      },
      frameCandidates: rt.frameCandidates,
    });
  }

  function handleNextQuestion() {
    finalizeCurrentQuestion();
    const nextIdx = currentQIndex + 1;
    if (nextIdx >= questions.length) {
      endInterview();
    } else {
      loadQuestion(nextIdx);
    }
  }

  function handleEndEarly() {
    finalizeCurrentQuestion();
    endInterview();
  }

  function endInterview() {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    onFinish(perQuestionResultsRef.current, midPausesUsed);
  }

  // ---------------------------------------------------------------
  // Pause system -- shared by the initial get-ready pause and any
  // mid-interview pause the user triggers manually.
  // ---------------------------------------------------------------
  function enterPauseMode(kind: "initial" | "mid") {
    isPausedRef.current = true;
    pausedAtTsRef.current = performance.now();
    pauseKindRef.current = kind;
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    setPauseKind(kind);
    setCountdownRemaining(pauseSecs);
    setPauseMode("countdown");
    loadMediaPipeModels()
      .then((lm) => {
        landmarkersRef.current = lm;
      })
      .catch((err) => console.error("MediaPipe load failed", err));
  }

  function runPauseCountdown(secs: number) {
    let remaining = secs;
    setCountdownRemaining(remaining);
    const timer = setInterval(() => {
      remaining -= 1;
      setCountdownRemaining(Math.max(remaining, 0));
      if (remaining <= 0) {
        clearInterval(timer);
        runEndOfPauseCheck();
      }
    }, 1000);
  }

  async function runEndOfPauseCheck() {
    const video = videoRef.current!;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0;
    for (let i = 0; i < imgData.length; i += 4 * 50) {
      total += (imgData[i] + imgData[i + 1] + imgData[i + 2]) / 3;
    }
    const avgBrightness = total / (imgData.length / (4 * 50));

    let faceDetected = false;
    let faceCentered = true;
    try {
      const lm = landmarkersRef.current || (await loadMediaPipeModels());
      landmarkersRef.current = lm;
      const result = lm.faceLandmarker.detectForVideo(canvas, nextLandmarkerTs());
      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        faceDetected = true;
        const nose = result.faceLandmarks[0][1];
        if (nose.x < 0.25 || nose.x > 0.75 || nose.y < 0.15 || nose.y > 0.85) {
          faceCentered = false;
        }
      }
    } catch (err) {
      console.error("Face check failed:", err);
    }

    const nextChecks: CheckItem[] = [];
    nextChecks.push({
      ok: faceDetected,
      label: faceDetected
        ? "Face detected"
        : "We couldn't detect your face — make sure you're centered in frame and try again.",
    });
    if (faceDetected) {
      nextChecks.push({
        ok: faceCentered,
        label: faceCentered ? "Well framed" : "You're a bit off-center — try facing the camera more directly.",
      });
    }
    nextChecks.push({
      ok: avgBrightness > 60 && avgBrightness < 220,
      label:
        avgBrightness <= 60
          ? "It looks quite dark — try facing a light source, not sitting with it behind you."
          : avgBrightness >= 220
            ? "You look backlit or overexposed — reduce light behind you."
            : "Lighting looks good",
    });

    setChecks(nextChecks);
    setPauseMode("check");
  }

  function exitPauseMode() {
    setPauseMode("none");
    isPausedRef.current = false;

    const wasInitialPause = currentQIndex === 0 && !hasStartedFirstQuestionRef.current;

    if (wasInitialPause) {
      beginQuestionFlow();
    } else {
      const rt = rtRef.current;
      const pausedAt = pausedAtTsRef.current;
      if (rt && pausedAt) {
        const pauseDurationMs = performance.now() - pausedAt;
        rt.startTs += pauseDurationMs;
        if (rt.speechStartTs) rt.speechStartTs += pauseDurationMs;
        if (rt.lastSpeechTs) rt.lastSpeechTs += pauseDurationMs;
        rt.lastFrameSampleTs += pauseDurationMs;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {
          /* ignore */
        }
      }
      trackingLoop();
    }
  }

  function handlePauseButtonClick() {
    const remaining = maxMidPauses - midPausesUsed;
    if (remaining <= 0) return;
    setMidPausesUsed((v) => v + 1);
    enterPauseMode("mid");
  }

  // ---------------------------------------------------------------
  // Mount: attach stream, set up speech recognition, kick off model
  // loading, and enter the initial pause (or start immediately if the
  // prep pause was skipped in setup).
  // ---------------------------------------------------------------
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const video = videoRef.current!;
    video.srcObject = stream;
    video.play().catch(() => {
      /* autoplay restrictions shouldn't apply -- video is muted */
    });

    setupSpeechRecognition();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* don't listen during get-ready pause */
    }

    const modelsReadyPromise = loadMediaPipeModels().then((lm) => {
      landmarkersRef.current = lm;
      return lm;
    });

    if (initialPrepSecs > 0) {
      // pauseMode/pauseSecs/countdownRemaining are already seeded correctly
      // by their lazy useState initializers above -- only the imperative
      // (ref) side of "entering" the pause is still needed here.
      isPausedRef.current = true;
      pausedAtTsRef.current = performance.now();
      pauseKindRef.current = "initial";
    } else {
      hasStartedFirstQuestionRef.current = true;
      if (!landmarkersRef.current) {
        modelsReadyPromise.then(() => {
          setTrackingStatus("Tracking…");
          beginQuestionFlow();
        });
      } else {
        beginQuestionFlow();
      }
    }

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pauseButtonRemaining = maxMidPauses - midPausesUsed;

  return (
    <div className="mx-auto mt-4 max-w-[1160px]">
      <div className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-hairline">
        <div className="mb-4 flex gap-1.5">
          {questions.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-2 w-2 rounded-full bg-border",
                i < currentQIndex && "bg-success",
                i === currentQIndex && "bg-primary"
              )}
            />
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-[480px_1fr]">
          <div>
            <div className="relative mx-auto aspect-[4/3] w-full max-w-[480px] overflow-hidden rounded-2xl bg-ink">
              <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />
              <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />

              <div className="absolute left-3 top-3 z-[5] flex gap-2">
                <span className="rounded-full bg-ink/65 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur-sm">
                  {trackingStatus}
                </span>
                <span className="rounded-full bg-ink/65 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur-sm">
                  {elapsed}
                </span>
              </div>

              {pauseMode === "countdown" && (
                <PauseCountdownOverlay
                  isInitialPause={pauseKind === "initial"}
                  pauseSecs={pauseSecs}
                  countdownRemaining={countdownRemaining}
                  onSelectSecs={setPauseSecs}
                  onBegin={() => runPauseCountdown(pauseSecs)}
                  countdownStarted={countdownRemaining !== pauseSecs || countdownRemaining === 0}
                />
              )}

              {pauseMode === "check" && (
                <PauseCheckOverlay
                  checks={checks}
                  onRetry={() => enterPauseMode(pauseKindRef.current)}
                  onResume={exitPauseMode}
                />
              )}
            </div>
          </div>

          <div className="flex max-h-[calc(100vh-160px)] flex-col overflow-y-auto pr-1">
            <div className="rounded-xl bg-primary-soft px-4 py-4">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                Question {currentQIndex + 1} of {questions.length}
              </div>
              <div className="text-[16px] font-medium text-ink">{questions[currentQIndex]}</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={handleNextQuestion}
                className="rounded-lg bg-primary-soft px-4 py-2.5 text-[14px] font-semibold text-primary"
              >
                Next question →
              </button>
              <button
                type="button"
                disabled={pauseButtonRemaining <= 0}
                onClick={handlePauseButtonClick}
                title={
                  pauseButtonRemaining <= 0
                    ? `You've used all ${maxMidPauses} pause${maxMidPauses === 1 ? "" : "s"} for this session — that's intentional, since the real interview won't have one either.`
                    : undefined
                }
                className="rounded-lg border border-hairline-strong px-4 py-2.5 text-[14px] font-medium text-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pauseButtonRemaining <= 0 ? "Pause (used up)" : `Pause (${pauseButtonRemaining} left)`}
              </button>
            </div>
            <div className="mt-2">
              <button type="button" onClick={handleEndEarly} className="text-[13px] text-muted hover:text-ink">
                End interview early
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <MetricChip label="Eye contact" value={`${liveMetrics.eyeContactPct}%`} />
              <MetricChip label="Blinks" value={liveMetrics.blinkEvents} />
              <MetricChip label="Pace" value={liveMetrics.wpm ? `${liveMetrics.wpm} wpm` : "—"} />
              <MetricChip label="Fillers" value={liveMetrics.fillerCount} />
              <MetricChip label="Long pauses" value={liveMetrics.longPauseCount} />
              <MetricChip
                label="Posture stability"
                value={liveMetrics.postureStability !== null ? liveMetrics.postureStability : "—"}
              />
            </div>

            <div className="mt-3.5 max-h-[120px] min-h-[40px] overflow-y-auto rounded-lg border border-hairline bg-canvas px-3.5 py-3 text-[13px] text-muted">
              {transcriptText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas px-3 py-2.5">
      <div className="text-[18px] font-bold text-ink">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function PauseCountdownOverlay({
  isInitialPause,
  pauseSecs,
  countdownRemaining,
  countdownStarted,
  onSelectSecs,
  onBegin,
}: {
  isInitialPause: boolean;
  pauseSecs: number;
  countdownRemaining: number;
  countdownStarted: boolean;
  onSelectSecs: (secs: number) => void;
  onBegin: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-ink/55 px-5 text-center text-white">
      <div className="mb-3 text-[64px] font-bold leading-none">{countdownStarted ? countdownRemaining : pauseSecs}</div>
      <div className="max-w-[340px] text-[14px] text-white/85">
        {isInitialPause
          ? "Frame your face in the center, make sure you're not backlit, and get comfortable."
          : "Take the break you need. When you're ready, pick a duration and resume when the timer ends."}
      </div>
      {!countdownStarted && (
        <>
          <div className="mt-4 flex max-w-[280px] gap-2">
            {PAUSE_DURATION_OPTIONS.map((secs) => (
              <button
                key={secs}
                type="button"
                onClick={() => onSelectSecs(secs)}
                className={cn(
                  "flex-1 rounded-lg bg-white/10 py-2 text-[13px] font-medium text-white",
                  pauseSecs === secs && "bg-white text-ink"
                )}
              >
                {secs}s
              </button>
            ))}
          </div>
          <div className="mt-4">
            <button type="button" onClick={onBegin} className="rounded-lg bg-primary px-5 py-2.5 text-[14px] font-semibold text-white">
              Start timer
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PauseCheckOverlay({
  checks,
  onRetry,
  onResume,
}: {
  checks: CheckItem[];
  onRetry: () => void;
  onResume: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-ink/55 px-5 text-center text-white">
      <div className="flex w-full max-w-[320px] flex-col gap-1.5 text-left text-[13px]">
        {checks.map((c, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg bg-white/10 px-2.5 py-1.5",
              c.ok ? "text-[#8FE3B4]" : "text-[#F3A8A8]"
            )}
          >
            {c.ok ? "✓" : "✕"} {c.label}
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2.5">
        <button type="button" onClick={onRetry} className="rounded-lg bg-white/15 px-4 py-2.5 text-[14px] font-semibold text-white">
          Retry pause
        </button>
        <button type="button" onClick={onResume} className="rounded-lg bg-primary px-4 py-2.5 text-[14px] font-semibold text-white">
          Resume interview
        </button>
      </div>
    </div>
  );
}
