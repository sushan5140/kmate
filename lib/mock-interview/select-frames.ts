// Ported from mock-interview-prototype.html's selectKeyFramesAndProceed --
// picks up to 5 frames that correspond to specific measured moments (never
// arbitrary), each tagged with why it was picked, for the Gemini feedback
// call to ground its observations in.
import type { QuestionResult, SelectedFrame } from "./types";

export function selectFeedbackFrames(perQuestionData: QuestionResult[]): SelectedFrame[] {
  const selected: SelectedFrame[] = [];

  let worstEyeContact: SelectedFrame | null = null;
  perQuestionData.forEach((q, qi) => {
    q.frameCandidates.forEach((f) => {
      if (!worstEyeContact || f.gazeAwayScore > worstEyeContact.gazeAwayScore) {
        worstEyeContact = { ...f, qi, reason: "Lowest eye contact moment of the session" };
      }
    });
  });
  if (worstEyeContact) selected.push(worstEyeContact);

  const hardestQ = perQuestionData.reduce<{ qi: number; score: number } | null>((best, q, qi) => {
    const score = q.metrics.fillerCount + q.metrics.longPauseCount * 2;
    return !best || score > best.score ? { qi, score } : best;
  }, null);
  if (hardestQ && perQuestionData[hardestQ.qi].frameCandidates.length) {
    const { qi } = hardestQ;
    const cands = perQuestionData[qi].frameCandidates;
    const mid = cands[Math.floor(cands.length / 2)];
    selected.push({
      ...mid,
      qi,
      reason: `Mid-answer moment during Q${qi + 1}, the toughest question by filler/pause count`,
    });
  }

  [0, perQuestionData.length - 1].forEach((qi) => {
    if (qi < 0) return;
    const cands = perQuestionData[qi]?.frameCandidates;
    if (cands && cands.length) {
      const mid = cands[Math.floor(cands.length / 2)];
      if (!selected.find((s) => s.dataUrl === mid.dataUrl)) {
        selected.push({ ...mid, qi, reason: `Representative frame from Q${qi + 1}` });
      }
    }
  });

  return selected.slice(0, 5);
}
