"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, Mic, Presentation, Video } from "lucide-react";
import { PresentationViewer, type SlideSnapshot } from "@/components/research-interview/presentation-viewer";
import { Button } from "@/components/ui/button";
import { computePostureStability, loadMediaPipeModels, nextLandmarkerTs } from "@/lib/mock-interview/mediapipe";
import type { LiveMetrics, QuestionMetrics, QuestionRuntime } from "@/lib/mock-interview/types";
import { buildResearchUnderstandingReport, evaluateResearchAnswer } from "@/lib/research-interview/gemini";
import type {
  DeliveryReport,
  PaperDigest,
  ResearchDifficulty,
  ResearchFocus,
  ResearchPhase,
  ResearchTurn,
  ResearchUnderstandingReport,
} from "@/lib/research-interview/types";
import { cn } from "@/lib/cn";

function newRuntime(): QuestionRuntime {
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

function buildMetrics(rt: QuestionRuntime): { transcript: string; metrics: QuestionMetrics } {
  const transcript = `${rt.transcriptFinal} ${rt.transcriptInterim}`.replace(/\s+/g, " ").trim();
  const durationSec = Math.max(1, (performance.now() - rt.startTs) / 1000);
  const wordCount = transcript ? transcript.split(/\s+/).length : 0;
  const fillerCount = (transcript.match(/\b(um+|uh+|like|you know)\b/gi) || []).length;
  return {
    transcript,
    metrics: {
      eyeContactPct: rt.frameCount > 0 ? Math.round((rt.eyeContactFrames / rt.frameCount) * 100) : 0,
      blinkEvents: rt.blinkEvents,
      wpm: wordCount ? Math.round(wordCount / (durationSec / 60)) : 0,
      fillerCount,
      longPauseCount: rt.pauseEvents.length,
      longestPauseSec: rt.pauseEvents.length ? Math.round(Math.max(...rt.pauseEvents) * 10) / 10 : 0,
      postureStability: computePostureStability(rt.posePositions),
      durationSec: Math.round(durationSec),
    },
  };
}

function buildDeliveryReport(turns: ResearchTurn[]): DeliveryReport {
  const metrics = turns.map((turn) => turn.metrics);
  const average = (values: number[]) =>
    values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  const eye = average(metrics.map((m) => m.eyeContactPct));
  const spokenWpm = metrics.map((m) => m.wpm).filter((value) => value > 0);
  const wpm = average(spokenWpm);
  const fillers = metrics.reduce((sum, m) => sum + m.fillerCount, 0);
  const pauses = metrics.reduce((sum, m) => sum + m.longPauseCount, 0);
  const longestPause = Math.max(0, ...metrics.map((m) => m.longestPauseSec));
  const postureSamples = metrics
    .map((m) => m.postureStability)
    .filter((value): value is number => value !== null);
  const posture = average(postureSamples);
  const captured = turns.filter((turn) => turn.transcript.trim().length > 0).length;

  return {
    summary: `Observable delivery mechanics were recorded on-device across ${turns.length} answers. These measurements describe camera alignment and speech timing only; they are not measures of confidence, emotion, personality, or psychological state.`,
    cameraFacingTendency: `Your face was within the camera-facing threshold on approximately ${eye}% of tracked frames across the interview. This is a framing tendency, not an eye-contact or confidence judgment.`,
    pace: spokenWpm.length
      ? `Speech pace averaged approximately ${wpm} words per minute across answers where speech was captured.`
      : "No reliable speech pace could be calculated because usable speech was not captured.",
    fillers: `${fillers} filler-word occurrences were captured across the interview using the same on-device transcript rules as KMate Mock Interview.`,
    pauses: `${pauses} pauses longer than 1.5 seconds were captured${pauses ? `; the longest was about ${longestPause} seconds` : ""}.`,
    postureStability: postureSamples.length
      ? `The shoulder-position stability index averaged ${posture}/100 across tracked answers. It describes movement stability only.`
      : "There were not enough tracked posture samples to calculate a stability index.",
    speechCapture: `Speech-to-text captured usable answer text for ${captured} of ${turns.length} answers. Transcript quality depends on browser speech recognition and microphone conditions.`,
    perAnswer: turns.map((turn) => ({
      questionIndex: turn.index,
      eyeContactPct: turn.metrics.eyeContactPct,
      wpm: turn.metrics.wpm,
      fillerCount: turn.metrics.fillerCount,
      longPauseCount: turn.metrics.longPauseCount,
      longestPauseSec: turn.metrics.longestPauseSec,
      postureStability: turn.metrics.postureStability,
      durationSec: turn.metrics.durationSec,
    })),
  };
}

export function ResearchInterviewStage({
  apiKey,
  stream,
  paperBase64,
  paperMimeType,
  digest,
  difficulty,
  focus,
  presentationFile,
  mainQuestionLimit,
  onFinish,
}: {
  apiKey: string;
  stream: MediaStream;
  paperBase64: string;
  paperMimeType: string;
  digest: PaperDigest;
  difficulty: ResearchDifficulty;
  focus: ResearchFocus;
  presentationFile: File;
  mainQuestionLimit: number;
  onFinish: (args: {
    turns: ResearchTurn[];
    researchReport: ResearchUnderstandingReport;
    deliveryReport: DeliveryReport;
  }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const landmarkersRef = useRef<{ faceLandmarker: any; poseLandmarker: any } | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const rafRef = useRef<number | null>(null);
  const runtimeRef = useRef<QuestionRuntime>(newRuntime());
  const turnsRef = useRef<ResearchTurn[]>([]);
  const activeSlideRef = useRef<SlideSnapshot>({ number: 1, text: "" });
  const evaluatingRef = useRef(false);
  const mountedRef = useRef(true);

  const [phase, setPhase] = useState<ResearchPhase>("main");
  const [question, setQuestion] = useState(digest.initialQuestion);
  const [questionType, setQuestionType] = useState(digest.initialQuestionType);
  const [mainAnswered, setMainAnswered] = useState(0);
  const [drillAnswered, setDrillAnswered] = useState(0);
  const [transcript, setTranscript] = useState("Listening…");
  const [trackingStatus, setTrackingStatus] = useState("Loading on-device tracking…");
  const [speechWarning, setSpeechWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTurn, setLastTurn] = useState<ResearchTurn | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>({
    eyeContactPct: 0,
    blinkEvents: 0,
    wpm: 0,
    fillerCount: 0,
    longPauseCount: 0,
    postureStability: null,
  });

  function restartRecognition() {
    const recognition = recognitionRef.current;
    if (!recognition || evaluatingRef.current) return;
    try {
      recognition.start();
    } catch {
      // Already active.
    }
  }

  function resetAnswerCapture() {
    runtimeRef.current = newRuntime();
    setTranscript("Listening…");
    setLiveMetrics({
      eyeContactPct: 0,
      blinkEvents: 0,
      wpm: 0,
      fillerCount: 0,
      longPauseCount: 0,
      postureStability: null,
    });
    setTimeout(restartRecognition, 220);
  }

  useEffect(() => {
    mountedRef.current = true;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setSpeechWarning(
        "Speech-to-text is unavailable in this browser. Camera mechanics can still be tracked, but research answers need Chrome speech recognition for full evaluation."
      );
    } else {
      const recognition: SpeechRecognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        if (evaluatingRef.current) return;
        const rt = runtimeRef.current;
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const chunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            const now = performance.now();
            if (rt.lastSpeechTs && (now - rt.lastSpeechTs) / 1000 > 1.5) {
              rt.pauseEvents.push((now - rt.lastSpeechTs) / 1000);
            }
            rt.lastSpeechTs = now;
            if (!rt.speechStartTs) rt.speechStartTs = now;
            rt.transcriptFinal += `${chunk} `;
          } else {
            interim += chunk;
          }
        }
        rt.transcriptInterim = interim;
        const currentText = `${rt.transcriptFinal} ${interim}`.replace(/\s+/g, " ").trim();
        setTranscript(currentText || "Listening…");
      };
      recognition.onerror = (event) => {
        const blocking = ["audio-capture", "network", "not-allowed", "service-not-allowed"];
        if (blocking.includes(event.error)) {
          setSpeechWarning(
            `Speech-to-text reported “${event.error}”. Camera mechanics still run, but answer evaluation needs a captured transcript.`
          );
        }
      };
      recognition.onend = restartRecognition;
      recognitionRef.current = recognition;
      restartRecognition();
    }

    void loadMediaPipeModels()
      .then((landmarkers) => {
        if (!mountedRef.current) return;
        landmarkersRef.current = landmarkers;
        setTrackingStatus("Tracking on-device");
      })
      .catch((err) => {
        console.error("MediaPipe load failed", err);
        if (mountedRef.current) setTrackingStatus("Camera tracking unavailable");
      });

    const loop = () => {
      if (!mountedRef.current) return;
      const currentVideo = videoRef.current;
      const canvas = canvasRef.current;
      const rt = runtimeRef.current;
      const landmarker = landmarkersRef.current;

      if (!evaluatingRef.current && currentVideo && canvas && currentVideo.readyState >= 2 && landmarker) {
        try {
          canvas.width = currentVideo.videoWidth || 640;
          canvas.height = currentVideo.videoHeight || 480;
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

          const face = landmarker.faceLandmarker.detectForVideo(currentVideo, nextLandmarkerTs());
          const pose = landmarker.poseLandmarker.detectForVideo(currentVideo, nextLandmarkerTs());
          rt.frameCount += 1;

          if (face.faceLandmarks?.length) {
            const points = face.faceLandmarks[0];
            const nose = points[1];
            const leftEye = points[33];
            const rightEye = points[263];
            const eyeSpan = Math.abs(rightEye.x - leftEye.x) || 0.01;
            const deviation = Math.abs(nose.x - (leftEye.x + rightEye.x) / 2) / eyeSpan;
            if (deviation < 0.35) rt.eyeContactFrames += 1;

            if (ctx) {
              const xs = points.map((point: { x: number }) => point.x * canvas.width);
              const ys = points.map((point: { y: number }) => point.y * canvas.height);
              ctx.strokeStyle = "#3E63DD";
              ctx.lineWidth = 2;
              ctx.strokeRect(
                Math.min(...xs),
                Math.min(...ys),
                Math.max(...xs) - Math.min(...xs),
                Math.max(...ys) - Math.min(...ys)
              );
            }
          }

          if (pose.landmarks?.length) {
            const points = pose.landmarks[0];
            const left = points[11];
            const right = points[12];
            if (left && right) {
              rt.posePositions.push({
                x: (left.x + right.x) / 2,
                y: (left.y + right.y) / 2,
                ts: performance.now(),
              });
              if (rt.posePositions.length > 300) rt.posePositions.shift();
            }
          }

          const snapshot = buildMetrics(rt);
          setLiveMetrics({
            eyeContactPct: snapshot.metrics.eyeContactPct,
            blinkEvents: 0,
            wpm: snapshot.metrics.wpm,
            fillerCount: snapshot.metrics.fillerCount,
            longPauseCount: snapshot.metrics.longPauseCount,
            postureStability: snapshot.metrics.postureStability,
          });
        } catch (err) {
          console.error("Research interview tracking error", err);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        recognitionRef.current?.stop();
      } catch {
        // no-op
      }
      recognitionRef.current = null;
    };
  }, [stream]);

  async function finishInterview(nextTurns: ResearchTurn[]) {
    setFinishing(true);
    setError(null);
    try {
      const researchReport = await buildResearchUnderstandingReport({
        apiKey,
        paperBase64,
        paperMimeType,
        digest,
        turns: nextTurns,
      });
      const deliveryReport = buildDeliveryReport(nextTurns);
      onFinish({ turns: nextTurns, researchReport, deliveryReport });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the final research report.");
      setFinishing(false);
    }
  }

  async function submitAnswer() {
    if (busy || finishing) return;
    const snapshot = buildMetrics(runtimeRef.current);
    if (!snapshot.transcript.trim()) {
      setError("No usable answer transcript was captured yet. Speak your answer before submitting, or switch to Chrome if speech recognition is unavailable.");
      return;
    }

    setBusy(true);
    setError(null);
    evaluatingRef.current = true;
    try {
      try {
        recognitionRef.current?.stop();
      } catch {
        // no-op
      }

      const currentSlide = activeSlideRef.current;
      const isLastMainQuestion = phase === "main" && mainAnswered + 1 >= mainQuestionLimit;
      const isLastDrillQuestion = phase === "weakness-drill" && drillAnswered + 1 >= 2;
      const evaluation = await evaluateResearchAnswer({
        apiKey,
        paperBase64,
        paperMimeType,
        digest,
        difficulty,
        focus,
        phase,
        question,
        questionType,
        answer: snapshot.transcript,
        activeSlideNumber: currentSlide.number,
        activeSlideText: currentSlide.text,
        previousTurns: turnsRef.current,
        isLastMainQuestion,
        isLastDrillQuestion,
      });

      const turn: ResearchTurn = {
        index: turnsRef.current.length + 1,
        phase,
        question,
        questionType,
        transcript: snapshot.transcript,
        slideNumber: currentSlide.number,
        metrics: snapshot.metrics,
        evaluation,
      };
      const nextTurns = [...turnsRef.current, turn];
      turnsRef.current = nextTurns;
      setLastTurn(turn);

      if (phase === "main") setMainAnswered((value) => value + 1);
      else setDrillAnswered((value) => value + 1);

      if (isLastDrillQuestion || !evaluation.nextQuestion) {
        await finishInterview(nextTurns);
        return;
      }

      if (isLastMainQuestion) setPhase("weakness-drill");
      setQuestion(evaluation.nextQuestion);
      setQuestionType(evaluation.nextQuestionType || (isLastMainQuestion ? "weakness drill" : "adaptive follow-up"));
      resetAnswerCapture();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The professor evaluation call failed.");
    } finally {
      if (mountedRef.current) {
        evaluatingRef.current = false;
        setBusy(false);
        if (!finishing) restartRecognition();
      }
    }
  }

  const progressText =
    phase === "main"
      ? `Main interview · ${Math.min(mainAnswered + 1, mainQuestionLimit)} / ${mainQuestionLimit}`
      : `Weakness drill · ${Math.min(drillAnswered + 1, 2)} / 2`;

  return (
    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:items-start">
      <section className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card">
        <div className="border-b border-hairline px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
                  phase === "main" ? "bg-primary-soft text-primary" : "bg-gold-soft text-gold"
                )}
              >
                {phase === "main" ? "Professor mode" : "Weakness drill"}
              </span>
              <span className="text-[11px] text-muted">{progressText}</span>
            </div>
            <span className="text-[11px] text-muted">{trackingStatus}</span>
          </div>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{questionType}</p>
          <h2 className="mt-1 text-[18px] font-semibold leading-snug text-ink">{question}</h2>
        </div>

        <div className="relative aspect-[4/3] overflow-hidden bg-ink">
          <video ref={videoRef} muted playsInline className="h-full w-full scale-x-[-1] object-cover" />
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full scale-x-[-1]" />
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm">
            <Video className="h-3.5 w-3.5" /> on-device camera analysis
          </div>
        </div>

        <div className="border-t border-hairline px-4 py-4">
          {speechWarning && (
            <div className="mb-3 flex gap-2 rounded-xl bg-gold-soft px-3 py-2.5 text-[12px] leading-relaxed text-gold">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{speechWarning}</span>
            </div>
          )}

          <div className="rounded-xl bg-canvas px-3.5 py-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <Mic className="h-3.5 w-3.5" /> Live transcript
            </div>
            <p className="mt-1.5 max-h-28 overflow-y-auto text-[13px] leading-relaxed text-ink">{transcript}</p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {[
              ["Camera-facing", `${liveMetrics.eyeContactPct}%`],
              ["Pace", liveMetrics.wpm ? `${liveMetrics.wpm} wpm` : "—"],
              ["Fillers", String(liveMetrics.fillerCount)],
              ["Long pauses", String(liveMetrics.longPauseCount)],
              ["Posture", liveMetrics.postureStability === null ? "—" : `${liveMetrics.postureStability}/100`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-hairline px-2.5 py-2.5">
                <p className="text-[10px] leading-tight text-muted">{label}</p>
                <p className="mt-1 text-[13px] font-semibold text-ink">{value}</p>
              </div>
            ))}
          </div>

          {lastTurn && (
            <div className="mt-3 rounded-xl border border-hairline bg-surface px-3.5 py-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <p className="text-[12px] font-semibold text-ink">Professor note from the previous answer</p>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{lastTurn.evaluation.professorChallenge}</p>
            </div>
          )}

          {error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2.5 text-[12px] text-danger">{error}</p>}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-[11px] leading-relaxed text-muted">
              The paper—not the slide deck—is the source of truth. Changing slides never submits or advances the interview.
            </p>
            <Button type="button" onClick={() => void submitAnswer()} disabled={busy || finishing}>
              <BrainCircuit className="h-4 w-4" />
              {finishing ? "Building reports…" : busy ? "Professor is evaluating…" : "Submit answer"}
            </Button>
          </div>
        </div>
      </section>

      <div className="xl:sticky xl:top-5">
        <div className="mb-2 flex items-center gap-2 px-1">
          <Presentation className="h-4 w-4 text-muted" />
          <p className="text-[12px] font-semibold text-ink">Your presentation</p>
          <span className="text-[11px] text-muted">manual control</span>
        </div>
        <PresentationViewer
          file={presentationFile}
          onSlideChange={(slide) => {
            activeSlideRef.current = slide;
          }}
        />
      </div>
    </div>
  );
}
