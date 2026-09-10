import type { QuestionMetrics } from "@/lib/mock-interview/types";

export const RESEARCH_DIFFICULTIES = ["supervisor", "professor", "thesis-defense", "reviewer"] as const;
export type ResearchDifficulty = (typeof RESEARCH_DIFFICULTIES)[number];

export const RESEARCH_FOCUS_MODES = ["balanced", "novelty", "methods", "results", "limitations"] as const;
export type ResearchFocus = (typeof RESEARCH_FOCUS_MODES)[number];

export type GroundingStatus = "supported" | "partially_supported" | "weak" | "unsupported";
export type ResearchPhase = "main" | "weakness-drill";

export interface CoverageArea {
  tag: string;
  label: string;
  description: string;
  evidenceHints: string[];
}

export interface PaperDigest {
  title: string;
  authors: string[];
  oneSentenceThesis: string;
  abstractSummary: string;
  contributionSummary: string[];
  methodsSummary: string[];
  resultsSummary: string[];
  limitations: string[];
  keyClaims: string[];
  coverageAreas: CoverageArea[];
  initialQuestion: string;
  initialQuestionType: string;
}

export interface TurnEvaluation {
  groundingStatus: GroundingStatus;
  evaluation: string;
  strengths: string[];
  missedPoints: string[];
  paperEvidence: string[];
  professorChallenge: string;
  strongerAnswer: string;
  contradictions: string[];
  nextQuestion: string | null;
  nextQuestionType: string | null;
  coverageTags: string[];
  difficultyAdjustment: "easier" | "same" | "harder";
}

export interface ResearchTurn {
  index: number;
  phase: ResearchPhase;
  question: string;
  questionType: string;
  transcript: string;
  slideNumber: number | null;
  metrics: QuestionMetrics;
  evaluation: TurnEvaluation;
}

export interface ResearchUnderstandingReport {
  overallAssessment: string;
  strongestAreas: string[];
  fragileAreas: string[];
  unresolvedContradictions: string[];
  coverageSummary: { tag: string; assessment: string }[];
  priorityRevisionPlan: string[];
}

export interface DeliveryReport {
  summary: string;
  cameraFacingTendency: string;
  pace: string;
  fillers: string;
  pauses: string;
  postureStability: string;
  speechCapture: string;
  perAnswer: Array<{
    questionIndex: number;
    eyeContactPct: number;
    wpm: number;
    fillerCount: number;
    longPauseCount: number;
    longestPauseSec: number;
    postureStability: number | null;
    durationSec: number;
  }>;
}
