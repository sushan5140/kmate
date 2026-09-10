import { GEMINI_MODEL } from "@/lib/mock-interview/constants";
import type {
  PaperDigest,
  ResearchDifficulty,
  ResearchFocus,
  ResearchPhase,
  ResearchTurn,
  ResearchUnderstandingReport,
  TurnEvaluation,
} from "@/lib/research-interview/types";

const GEMINI_URL = (apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function parseJsonText<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}

async function geminiJson<T>(
  apiKey: string,
  parts: Array<Record<string, unknown>>,
  label: string
): Promise<T> {
  const response = await fetch(GEMINI_URL(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.35,
      },
    }),
  });

  if (response.status === 429) {
    throw new Error(`Gemini quota was reached while ${label}. Try again after your key's quota resets.`);
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed (${response.status}). ${body.slice(0, 280)}`);
  }

  const data = await response.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini returned no structured output while ${label}.`);
  try {
    return parseJsonText<T>(text);
  } catch {
    throw new Error(`Gemini returned malformed structured output while ${label}.`);
  }
}

function paperPart(paperBase64: string, mimeType: string) {
  return { inline_data: { mime_type: mimeType || "application/pdf", data: paperBase64 } };
}

export async function understandResearchPaper(args: {
  apiKey: string;
  paperBase64: string;
  paperMimeType: string;
  difficulty: ResearchDifficulty;
  focus: ResearchFocus;
}): Promise<PaperDigest> {
  const { apiKey, paperBase64, paperMimeType, difficulty, focus } = args;
  const prompt = `You are preparing a rigorous adaptive research interview from the attached research paper.
The PAPER is the authoritative source. Read it deeply before asking anything.
Interview mode: ${difficulty}. Focus: ${focus}.

Return ONLY a JSON object with this exact shape:
{
  "title": string,
  "authors": string[],
  "oneSentenceThesis": string,
  "abstractSummary": string,
  "contributionSummary": string[],
  "methodsSummary": string[],
  "resultsSummary": string[],
  "limitations": string[],
  "keyClaims": string[],
  "coverageAreas": [{"tag": string, "label": string, "description": string, "evidenceHints": string[]}],
  "initialQuestion": string,
  "initialQuestionType": string
}

Coverage areas should be compact interviewable concepts from the actual paper, typically 6-12 areas. Evidence hints should identify paper-grounded facts, equations, findings, caveats, figures, sections, or page references when visible. The opening question should sound like a real professor in the selected mode, not a quiz bot.`;

  return geminiJson<PaperDigest>(
    apiKey,
    [{ text: prompt }, paperPart(paperBase64, paperMimeType)],
    "understanding the research paper"
  );
}

function compactHistory(turns: ResearchTurn[]) {
  return turns.map((turn) => ({
    index: turn.index,
    phase: turn.phase,
    question: turn.question,
    answer: turn.transcript,
    groundingStatus: turn.evaluation.groundingStatus,
    missedPoints: turn.evaluation.missedPoints,
    contradictions: turn.evaluation.contradictions,
    coverageTags: turn.evaluation.coverageTags,
    slideNumber: turn.slideNumber,
  }));
}

export async function evaluateResearchAnswer(args: {
  apiKey: string;
  paperBase64: string;
  paperMimeType: string;
  digest: PaperDigest;
  difficulty: ResearchDifficulty;
  focus: ResearchFocus;
  phase: ResearchPhase;
  question: string;
  questionType: string;
  answer: string;
  activeSlideNumber: number | null;
  activeSlideText: string;
  previousTurns: ResearchTurn[];
  isLastMainQuestion: boolean;
  isLastDrillQuestion: boolean;
}): Promise<TurnEvaluation> {
  const {
    apiKey,
    paperBase64,
    paperMimeType,
    digest,
    difficulty,
    focus,
    phase,
    question,
    questionType,
    answer,
    activeSlideNumber,
    activeSlideText,
    previousTurns,
    isLastMainQuestion,
    isLastDrillQuestion,
  } = args;

  const prompt = `Act as a ${difficulty} conducting an adaptive research interview. Focus mode: ${focus}.
The attached PAPER is authoritative. The presentation context is secondary and must NEVER override or replace the paper.
Every next question must depend on BOTH the paper and the candidate's immediately preceding answer/history. Do not pre-generate a fixed question list.

CURRENT PHASE: ${phase}
CURRENT QUESTION TYPE: ${questionType}
CURRENT QUESTION: ${question}
CANDIDATE ANSWER: ${answer || "(no usable transcript captured)"}
ACTIVE PRESENTATION SLIDE: ${activeSlideNumber ?? "none"}
VISIBLE SLIDE TEXT (secondary context only): ${activeSlideText.slice(0, 4000) || "(unavailable)"}
IS LAST PLANNED MAIN QUESTION: ${isLastMainQuestion}
IS LAST WEAKNESS-DRILL QUESTION: ${isLastDrillQuestion}

PAPER DIGEST FOR ORIENTATION:
${JSON.stringify(digest)}

PREVIOUS INTERVIEW TURNS:
${JSON.stringify(compactHistory(previousTurns))}

Evaluate only research understanding/content here. Do NOT infer confidence, emotion, personality, deception, anxiety, or any psychological state from wording, camera, or delivery.
Grounding status must be exactly one of: supported, partially_supported, weak, unsupported.
Contradictions means contradictions with the paper or with the candidate's own earlier answers; return [] if none.
Coverage tags must use tags from the supplied paper digest when possible.
If this is the last planned MAIN question, the next question should begin a targeted weakness drill based on the weakest or least-covered paper-grounded area.
If this is the last weakness-drill question, nextQuestion and nextQuestionType MUST be null.
Otherwise the next question must adapt to this answer: challenge an assumption, probe omitted evidence, test a limitation, ask for methodological reasoning, or deepen a result depending on what the answer reveals.

Return ONLY JSON with exactly this shape:
{
  "groundingStatus": "supported" | "partially_supported" | "weak" | "unsupported",
  "evaluation": string,
  "strengths": string[],
  "missedPoints": string[],
  "paperEvidence": string[],
  "professorChallenge": string,
  "strongerAnswer": string,
  "contradictions": string[],
  "nextQuestion": string | null,
  "nextQuestionType": string | null,
  "coverageTags": string[],
  "difficultyAdjustment": "easier" | "same" | "harder"
}`;

  return geminiJson<TurnEvaluation>(
    apiKey,
    [{ text: prompt }, paperPart(paperBase64, paperMimeType)],
    "evaluating the research answer"
  );
}

export async function buildResearchUnderstandingReport(args: {
  apiKey: string;
  paperBase64: string;
  paperMimeType: string;
  digest: PaperDigest;
  turns: ResearchTurn[];
}): Promise<ResearchUnderstandingReport> {
  const { apiKey, paperBase64, paperMimeType, digest, turns } = args;
  const prompt = `Create the FINAL Research Understanding report for this completed professor-style interview.
The attached PAPER remains authoritative. This report is about research understanding only; do not discuss camera, pace, fillers, posture, emotion, personality, or confidence.
Use the turn evaluations, contradiction history, and coverage tags to synthesize where the candidate understands the paper and where understanding remains fragile.

PAPER DIGEST:
${JSON.stringify(digest)}

TURNS:
${JSON.stringify(compactHistory(turns))}

Return ONLY JSON with this shape:
{
  "overallAssessment": string,
  "strongestAreas": string[],
  "fragileAreas": string[],
  "unresolvedContradictions": string[],
  "coverageSummary": [{"tag": string, "assessment": string}],
  "priorityRevisionPlan": string[]
}`;

  return geminiJson<ResearchUnderstandingReport>(
    apiKey,
    [{ text: prompt }, paperPart(paperBase64, paperMimeType)],
    "building the research-understanding report"
  );
}
