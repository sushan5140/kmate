export interface FrameCandidate {
  dataUrl: string;
  ts: number;
  gazeAwayScore: number;
}

// Mutable, per-question accumulator updated every tracking-loop frame and
// every speech-recognition result. Lives in a ref (not React state) in the
// interview stage component -- same reasoning as the prototype's direct DOM
// writes: this updates up to 60x/sec and re-rendering React that often would
// be wasteful, so only the derived display values get pushed into state.
export interface QuestionRuntime {
  startTs: number;
  frameCount: number;
  eyeContactFrames: number;
  blinkEvents: number;
  lastEyeState: "open" | "closed";
  posePositions: { x: number; y: number; ts: number }[];
  lastFrameSampleTs: number;
  frameCandidates: FrameCandidate[];
  transcriptFinal: string;
  transcriptInterim: string;
  speechStartTs: number | null;
  lastSpeechTs: number | null;
  pauseEvents: number[]; // gaps > 1.5s while question is active, in seconds
  wordCount: number;
  fillerCount: number;
}

export interface QuestionMetrics {
  eyeContactPct: number;
  blinkEvents: number;
  wpm: number;
  fillerCount: number;
  longPauseCount: number;
  longestPauseSec: number;
  postureStability: number | null;
  durationSec: number;
}

export interface QuestionResult {
  question: string;
  transcript: string;
  metrics: QuestionMetrics;
  frameCandidates: FrameCandidate[];
}

export interface LiveMetrics {
  eyeContactPct: number;
  blinkEvents: number;
  wpm: number;
  fillerCount: number;
  longPauseCount: number;
  postureStability: number | null;
}

export interface SelectedFrame extends FrameCandidate {
  qi: number;
  reason: string;
}
