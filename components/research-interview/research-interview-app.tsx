"use client";

import { useMemo, useState } from "react";
import { FileText, KeyRound, Presentation, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { PresentationViewer } from "@/components/research-interview/presentation-viewer";
import { ResearchInterviewStage } from "@/components/research-interview/research-interview-stage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GEMINI_MODEL } from "@/lib/mock-interview/constants";
import { fileToBase64, understandResearchPaper } from "@/lib/research-interview/gemini";
import {
  RESEARCH_DIFFICULTIES,
  RESEARCH_FOCUS_MODES,
  type DeliveryReport,
  type PaperDigest,
  type ResearchDifficulty,
  type ResearchFocus,
  type ResearchTurn,
  type ResearchUnderstandingReport,
} from "@/lib/research-interview/types";
import { cn } from "@/lib/cn";

type Stage = "setup" | "preparing" | "interview" | "results";

const DIFFICULTY_LABELS: Record<ResearchDifficulty, string> = {
  supervisor: "Supervisor",
  professor: "Professor",
  "thesis-defense": "Thesis defense",
  reviewer: "Reviewer",
};

const DIFFICULTY_COPY: Record<ResearchDifficulty, string> = {
  supervisor: "Guiding but probing: checks whether you truly understand what the paper is doing.",
  professor: "Academic viva style: follows your reasoning and presses on incomplete explanations.",
  "thesis-defense": "Defense style: assumptions, design choices, evidence, limitations, and alternatives.",
  reviewer: "Critical peer-review style: novelty, validity, evidence quality, and weaknesses under pressure.",
};

const FOCUS_LABELS: Record<ResearchFocus, string> = {
  balanced: "Balanced",
  novelty: "Novelty",
  methods: "Methods",
  results: "Results",
  limitations: "Limitations",
};

const PAPER_LIMIT_BYTES = 18 * 1024 * 1024;
const PPTX_LIMIT_BYTES = 35 * 1024 * 1024;

interface CompletedInterview {
  turns: ResearchTurn[];
  researchReport: ResearchUnderstandingReport;
  deliveryReport: DeliveryReport;
}

function GroundingBadge({ status }: { status: ResearchTurn["evaluation"]["groundingStatus"] }) {
  const classes = {
    supported: "bg-emerald-50 text-emerald-700",
    partially_supported: "bg-primary-soft text-primary",
    weak: "bg-gold-soft text-gold",
    unsupported: "bg-danger-soft text-danger",
  }[status];
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide", classes)}>
      {status.replace("_", " ")}
    </span>
  );
}

export function ResearchInterviewApp() {
  const [stage, setStage] = useState<Stage>("setup");
  const [apiKey, setApiKey] = useState("");
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [presentationFile, setPresentationFile] = useState<File | null>(null);
  const [difficulty, setDifficulty] = useState<ResearchDifficulty>("professor");
  const [focus, setFocus] = useState<ResearchFocus>("balanced");
  const [questionCount, setQuestionCount] = useState(5);
  const [paperBase64, setPaperBase64] = useState<string | null>(null);
  const [digest, setDigest] = useState<PaperDigest | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [completed, setCompleted] = useState<CompletedInterview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const coverageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    completed?.turns.forEach((turn) => {
      turn.evaluation.coverageTags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    });
    return counts;
  }, [completed]);

  function validateFile(file: File, kind: "paper" | "presentation"): string | null {
    if (kind === "paper") {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        return "Research paper must be a PDF for paper-grounded Gemini analysis.";
      }
      if (file.size > PAPER_LIMIT_BYTES) return "Research paper is too large for this browser session (18 MB maximum).";
      return null;
    }
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      return "Presentation must be a .pptx file. Legacy .ppt files are not supported by the in-browser renderer.";
    }
    if (file.size > PPTX_LIMIT_BYTES) return "Presentation is too large for this browser session (35 MB maximum).";
    return null;
  }

  async function validateApiKey(key: string) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with just OK" }] }] }),
      }
    );
    if (response.status === 429) throw new Error("This Gemini key has reached its current quota.");
    if (!response.ok) throw new Error(`Gemini API key validation failed (${response.status}).`);
  }

  async function startInterview() {
    const trimmedKey = apiKey.trim();
    if (!paperFile || !presentationFile || !trimmedKey) {
      setError("Add the research paper, PowerPoint, and your Gemini API key before starting.");
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera and microphone require a secure HTTPS page in a supported browser such as Chrome.");
      return;
    }

    setError(null);
    setStage("preparing");
    try {
      await validateApiKey(trimmedKey);
      const encodedPaper = await fileToBase64(paperFile);
      const paperDigest = await understandResearchPaper({
        apiKey: trimmedKey,
        paperBase64: encodedPaper,
        paperMimeType: paperFile.type || "application/pdf",
        difficulty,
        focus,
      });
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: true,
      });
      setPaperBase64(encodedPaper);
      setDigest(paperDigest);
      setStream(media);
      setStage("interview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare the research interview.");
      setStage("setup");
    }
  }

  async function saveCompletedInterview(result: CompletedInterview, paperDigest: PaperDigest) {
    if (!paperFile || !presentationFile) return;
    setSaveState("saving");
    try {
      const response = await fetch("/api/research-interview/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperTitle: paperDigest.title,
          paperFileName: paperFile.name,
          presentationFileName: presentationFile.name,
          difficulty,
          focus,
          plannedQuestionCount: questionCount,
          status: "completed",
          researchReport: result.researchReport,
          deliveryReport: result.deliveryReport,
          turns: result.turns.map((turn) => ({
            turnIndex: turn.index,
            phase: turn.phase,
            questionText: turn.question,
            questionType: turn.questionType,
            transcript: turn.transcript,
            slideNumber: turn.slideNumber,
            groundingStatus: turn.evaluation.groundingStatus,
            coverageTags: turn.evaluation.coverageTags,
            evaluation: turn.evaluation,
            metrics: turn.metrics,
          })),
        }),
      });
      setSaveState(response.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }

  function reset() {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setPaperBase64(null);
    setDigest(null);
    setCompleted(null);
    setSaveState("idle");
    setError(null);
    setStage("setup");
  }

  if (stage === "preparing") {
    return (
      <Card className="mt-5 overflow-hidden">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Reading the paper before the interview</h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
              Gemini is building a paper-grounded map of the contribution, methods, results, claims, and limitations. Questions are not being pre-generated; only the opening question is selected now.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (stage === "interview" && stream && paperBase64 && digest && presentationFile && paperFile) {
    return (
      <ResearchInterviewStage
        apiKey={apiKey.trim()}
        stream={stream}
        paperBase64={paperBase64}
        paperMimeType={paperFile.type || "application/pdf"}
        digest={digest}
        difficulty={difficulty}
        focus={focus}
        presentationFile={presentationFile}
        mainQuestionLimit={questionCount}
        onFinish={(result) => {
          stream.getTracks().forEach((track) => track.stop());
          setStream(null);
          setCompleted(result);
          setStage("results");
          void saveCompletedInterview(result, digest);
        }}
      />
    );
  }

  if (stage === "results" && completed && digest) {
    return (
      <div className="mt-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Research Interview complete</p>
            <h2 className="mt-1 text-[20px] font-semibold text-ink">{digest.title}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted">
              {saveState === "saving" && "Saving session metadata…"}
              {saveState === "saved" && "Session metadata saved"}
              {saveState === "error" && "Report is ready · session metadata could not be saved"}
            </span>
            <Button variant="secondary" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" /> New interview
            </Button>
          </div>
        </div>

        <Card>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Research Understanding report</p>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-ink">{completed.researchReport.overallAssessment}</p>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="text-[12px] font-semibold text-ink">Strongest areas</h3>
              <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-muted">
                {completed.researchReport.strongestAreas.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="text-[12px] font-semibold text-ink">Fragile areas</h3>
              <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-muted">
                {completed.researchReport.fragileAreas.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          </div>
          {!!completed.researchReport.unresolvedContradictions.length && (
            <div className="mt-5 rounded-xl bg-danger-soft px-3.5 py-3">
              <h3 className="text-[12px] font-semibold text-danger">Unresolved contradictions</h3>
              <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-danger">
                {completed.researchReport.unresolvedContradictions.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          )}
        </Card>

        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Research coverage map</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {digest.coverageAreas.map((area) => {
              const count = coverageCounts.get(area.tag) || 0;
              const summary = completed.researchReport.coverageSummary.find((item) => item.tag === area.tag)?.assessment;
              return (
                <div key={area.tag} className="rounded-xl border border-hairline px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-semibold text-ink">{area.label}</p>
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] text-muted">{count} turn{count === 1 ? "" : "s"}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{summary || area.description}</p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Interview Delivery report</p>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">{completed.deliveryReport.summary}</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {[
              ["Camera-facing tendency", completed.deliveryReport.cameraFacingTendency],
              ["Pace", completed.deliveryReport.pace],
              ["Fillers", completed.deliveryReport.fillers],
              ["Pauses", completed.deliveryReport.pauses],
              ["Posture stability", completed.deliveryReport.postureStability],
              ["Speech capture", completed.deliveryReport.speechCapture],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-canvas px-3.5 py-3">
                <p className="text-[11px] font-semibold text-ink">{label}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{value}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-3">
          {completed.turns.map((turn) => (
            <Card key={turn.index}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-muted">Q{turn.index}</span>
                  <GroundingBadge status={turn.evaluation.groundingStatus} />
                  <span className="text-[10px] text-muted">Slide {turn.slideNumber ?? "—"}</span>
                  {turn.phase === "weakness-drill" && <span className="text-[10px] font-semibold text-gold">WEAKNESS DRILL</span>}
                </div>
                <span className="text-[10px] text-muted">{turn.questionType}</span>
              </div>
              <h3 className="mt-2 text-[14px] font-semibold leading-snug text-ink">{turn.question}</h3>
              <p className="mt-2 rounded-xl bg-canvas px-3 py-2.5 text-[12px] leading-relaxed text-muted">{turn.transcript}</p>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink">{turn.evaluation.evaluation}</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold text-ink">Missed paper points</p>
                  <ul className="mt-1.5 space-y-1 text-[11.5px] leading-relaxed text-muted">
                    {turn.evaluation.missedPoints.length ? turn.evaluation.missedPoints.map((item) => <li key={item}>• {item}</li>) : <li>None flagged</li>}
                  </ul>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-ink">Paper evidence to mention</p>
                  <ul className="mt-1.5 space-y-1 text-[11.5px] leading-relaxed text-muted">
                    {turn.evaluation.paperEvidence.length ? turn.evaluation.paperEvidence.map((item) => <li key={item}>• {item}</li>) : <li>None flagged</li>}
                  </ul>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-hairline px-3 py-3">
                <p className="text-[11px] font-semibold text-ink">Professor challenge</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{turn.evaluation.professorChallenge}</p>
                <p className="mt-3 text-[11px] font-semibold text-ink">Stronger paper-grounded answer</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{turn.evaluation.strongerAnswer}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <Card>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold text-ink">Paper + interview mode</h2>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            The PDF is the authoritative source for every content judgment. Files stay in this browser session and the originals are not uploaded to KMate storage.
          </p>

          <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-muted">Research paper PDF</label>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              if (!file) return;
              const problem = validateFile(file, "paper");
              if (problem) {
                setError(problem);
                event.target.value = "";
                return;
              }
              setPaperFile(file);
              setError(null);
            }}
            className="mt-1.5 block w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-[12px] text-muted file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-white"
          />
          {paperFile && <p className="mt-1.5 truncate text-[11px] text-primary">{paperFile.name}</p>}

          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Difficulty</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {RESEARCH_DIFFICULTIES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDifficulty(mode)}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left transition-colors",
                    difficulty === mode ? "border-primary bg-primary-soft" : "border-hairline hover:bg-canvas"
                  )}
                >
                  <p className={cn("text-[12px] font-semibold", difficulty === mode ? "text-primary" : "text-ink")}>{DIFFICULTY_LABELS[mode]}</p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{DIFFICULTY_COPY[mode]}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Focus</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {RESEARCH_FOCUS_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFocus(mode)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
                    focus === mode ? "bg-ink text-white" : "bg-canvas text-muted hover:text-ink"
                  )}
                >
                  {FOCUS_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Main interview questions</label>
          <select
            value={questionCount}
            onChange={(event) => setQuestionCount(Number(event.target.value))}
            className="mt-1.5 rounded-xl border border-hairline-strong bg-surface px-3 py-2 text-[12px] text-ink"
          >
            {[3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count} + 2-question weakness drill</option>)}
          </select>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2">
              <Presentation className="h-4 w-4 text-primary" />
              <h2 className="text-[15px] font-semibold text-ink">Presentation</h2>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              Upload the PPTX you will present. It renders inside KMate, remains under your control, and is treated only as secondary interview context.
            </p>
            <input
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                if (!file) return;
                const problem = validateFile(file, "presentation");
                if (problem) {
                  setError(problem);
                  event.target.value = "";
                  return;
                }
                setPresentationFile(file);
                setError(null);
              }}
              className="mt-3 block w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-[12px] text-muted file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-white"
            />
          </Card>
          {presentationFile && <PresentationViewer file={presentationFile} />}
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <h2 className="text-[15px] font-semibold text-ink">Gemini BYOK</h2>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              Your key is used directly from this browser to Google&apos;s Generative Language API. KMate does not send it to its backend or save it to Supabase.
            </p>
          </div>
          <div className="flex w-full max-w-xl gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="AIza…"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-full border border-hairline-strong bg-surface px-4 py-2 font-mono text-[12px] text-ink outline-none focus:border-primary"
            />
            <Button type="button" onClick={() => void startInterview()}>
              Start research interview
            </Button>
          </div>
        </div>
        {error && <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12px] text-danger">{error}</p>}
      </Card>
    </div>
  );
}
