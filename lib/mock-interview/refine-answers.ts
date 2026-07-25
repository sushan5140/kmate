// A second, independent Gemini call (same BYOK/client-side model as
// gemini-feedback.ts) that rewrites each answer the candidate actually gave
// into a clearer, more natural-sounding version -- same substance, better
// phrasing. Deliberately kept separate from getInterviewFeedback: if this
// call fails, the (already-working) delivery feedback should be unaffected,
// and vice versa.
import { GEMINI_MODEL } from "./constants";
import type { QuestionResult } from "./types";

const REFINE_SYSTEM_PROMPT = `You are helping a scholarship applicant improve how they express answers they already gave out loud in a mock interview.
For each question below, rewrite THEIR answer -- not a new one -- so it sounds clearer, more confident, and more natural, as if they'd had a moment to collect their thoughts before speaking.
RULES:
- Use only what they actually said. Never invent facts, experiences, achievements, or reasons they didn't mention. If their answer was thin, the refined version stays thin -- just better phrased, not padded with invented content.
- Write it exactly like a real person would say it out loud in an interview: first person, natural spoken rhythm, contractions where natural, plain everyday word choices.
- Do NOT sound like an AI or a chatbot. Avoid words/phrases like "Furthermore", "In conclusion", "It's important to note", "I hope this helps", corporate or resume-style phrasing, perfectly symmetrical list structures, and generic filler openers like "That's a great question."
- Keep roughly the same length as what they actually said -- a little tighter is fine, but this is a better-phrased version of their answer, not an essay or a different answer.
- If a transcript is exactly "(no speech captured)", set refinedAnswer to exactly: "No answer was captured for this question, so there's nothing to refine."
Return one entry per question, in the same order given, with the matching questionIndex (0-based).`;

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      questionIndex: { type: "INTEGER" },
      refinedAnswer: { type: "STRING" },
    },
    required: ["questionIndex", "refinedAnswer"],
  },
};

export interface RefinedAnswer {
  questionIndex: number;
  refinedAnswer: string;
}

export type RefineResult = { ok: true; answers: RefinedAnswer[] } | { ok: false; message: string };

export async function getRefinedAnswers(apiKey: string, results: QuestionResult[]): Promise<RefineResult> {
  const perQSummary = results
    .map((q, i) => `Q${i + 1} (questionIndex ${i}): "${q.question}"\nWhat they said: ${q.transcript || "(no speech captured)"}`)
    .join("\n\n");

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: REFINE_SYSTEM_PROMPT + "\n\n---\n\n" + perQSummary }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    if (resp.status === 429) {
      return { ok: false, message: "Free-tier quota reached while refining answers." };
    }
    if (!resp.ok) {
      const errText = await resp.text();
      return { ok: false, message: `Refine-answers request failed (${resp.status}). ${errText.slice(0, 300)}` };
    }

    const data = await resp.json();
    const raw: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return { ok: false, message: "Gemini returned no refined answers." };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, message: "Gemini's refined-answers response wasn't valid JSON." };
    }
    if (!Array.isArray(parsed)) return { ok: false, message: "Gemini's refined-answers response wasn't a list." };

    const answers: RefinedAnswer[] = parsed.filter(
      (a): a is RefinedAnswer =>
        !!a && typeof a === "object" && typeof (a as RefinedAnswer).questionIndex === "number" && typeof (a as RefinedAnswer).refinedAnswer === "string"
    );
    if (answers.length === 0) return { ok: false, message: "Gemini's refined-answers response was empty or malformed." };

    return { ok: true, answers };
  } catch (err) {
    return {
      ok: false,
      message: `Network error refining answers: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
