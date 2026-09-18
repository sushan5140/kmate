// Ported from mock-interview-prototype.html's runFeedbackCall -- the single
// end-of-interview Gemini call. BYOK and client-side only: the user's key
// never touches KMate's backend, only Google's API directly from the browser.
import { GEMINI_MODEL } from "./constants";
import type { QuestionResult, SelectedFrame } from "./types";

const SYSTEM_PROMPT = `You are giving delivery-mechanics feedback on a scholarship mock interview.
STRICT SCOPE: comment ONLY on delivery mechanics — clarity, pacing, filler words, eye contact, posture, pauses.
NEVER comment on the correctness or quality of the content/answers themselves.
NEVER assign a single overall "confidence score" or numeric rating.
Ground every observation in the specific metrics or frames provided — do not invent details.
Be specific: reference which question a pattern occurred in when relevant.
Write in a plain, encouraging, non-judgmental tone — describe patterns, not the person's character.
Structure your response as:
1. A 2-3 sentence overall summary of delivery patterns across the interview.
2. 3-5 specific, concrete observations tied to metrics/frames (e.g. "During Q3, right after a 4-second pause, filler words increased").
3. One paragraph of suggestions for practice, framed as optional next steps, not corrections.`;

export type FeedbackResult = { ok: true; text: string } | { ok: false; message: string };

export async function getInterviewFeedback(
  apiKey: string,
  results: QuestionResult[],
  frames: SelectedFrame[]
): Promise<FeedbackResult> {
  const perQSummary = results
    .map(
      (q, i) =>
        `Q${i + 1}: "${q.question}"\nTranscript: ${q.transcript || "(no speech captured)"}\nMetrics: eye contact ${q.metrics.eyeContactPct}%, ${q.metrics.wpm} wpm, ${q.metrics.fillerCount} filler words, ${q.metrics.longPauseCount} long pauses (longest ${q.metrics.longestPauseSec}s), posture stability ${q.metrics.postureStability ?? "n/a"}/100, duration ${q.metrics.durationSec}s`
    )
    .join("\n\n");

  const parts: Record<string, unknown>[] = [
    {
      text:
        SYSTEM_PROMPT +
        "\n\n---\n\nINTERVIEW DATA:\n\n" +
        perQSummary +
        "\n\n---\n\nThe following images are frames selected because they correspond to specific measured moments (reason noted below each). Use them only to support observations already grounded in the metrics above, not to invent new judgments.",
    },
  ];

  frames.forEach((f) => {
    parts.push({ text: `Frame reason: ${f.reason}` });
    parts.push({ inline_data: { mime_type: "image/jpeg", data: f.dataUrl.split(",")[1] } });
  });

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }] }),
      }
    );

    if (resp.status === 429) {
      return {
        ok: false,
        message:
          "Your free-tier daily quota was reached while requesting feedback. This resets at midnight Pacific Time — your recorded metrics are still shown below.",
      };
    }
    if (!resp.ok) {
      const errText = await resp.text();
      return {
        ok: false,
        message: `Feedback request failed (${resp.status}). Your recorded metrics are still shown below.\n\n${errText.slice(0, 300)}`,
      };
    }

    const data = await resp.json();
    const feedbackText: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!feedbackText) {
      return { ok: false, message: "Gemini returned no feedback text. Your recorded metrics are still shown below." };
    }
    return { ok: true, text: feedbackText };
  } catch (err) {
    return {
      ok: false,
      message: `Network error contacting Gemini: ${err instanceof Error ? err.message : String(err)}. Your recorded metrics are still shown below.`,
    };
  }
}
