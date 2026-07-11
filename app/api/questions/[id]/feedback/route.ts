import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

// PRD §12.3: feedback is scoped strictly to clarity/confidence/repetition/
// length -- never content correctness. Nobody can reliably judge whether an
// answer's substance will impress a specific interviewer; structural/delivery
// feedback is safe, useful territory.
const SYSTEM_PROMPT = `You give structural feedback on a GKS scholarship interview answer draft.

Score exactly four dimensions, each 1-5 (5 = best):
- clarity: is the answer easy to follow and well-organized?
- confidence: does the phrasing sound sure of itself, or hedgy/apologetic?
- repetition: does it repeat words, phrases, or ideas unnecessarily?
- length: is it an appropriate length for a spoken interview answer (roughly 30-90 seconds spoken, not a written essay)?

For each dimension, give a one-sentence note explaining the score.

You must NEVER comment on whether the content itself is true, impressive, or the "right" answer -- that is not your job and you have no way to judge it. Only comment on delivery and structure.`;

const FEEDBACK_SCHEMA = {
  type: "object",
  properties: {
    clarity: {
      type: "object",
      properties: {
        score: { type: "integer", enum: [1, 2, 3, 4, 5] },
        note: { type: "string" },
      },
      required: ["score", "note"],
      additionalProperties: false,
    },
    confidence: {
      type: "object",
      properties: {
        score: { type: "integer", enum: [1, 2, 3, 4, 5] },
        note: { type: "string" },
      },
      required: ["score", "note"],
      additionalProperties: false,
    },
    repetition: {
      type: "object",
      properties: {
        score: { type: "integer", enum: [1, 2, 3, 4, 5] },
        note: { type: "string" },
      },
      required: ["score", "note"],
      additionalProperties: false,
    },
    length: {
      type: "object",
      properties: {
        score: { type: "integer", enum: [1, 2, 3, 4, 5] },
        note: { type: "string" },
      },
      required: ["score", "note"],
      additionalProperties: false,
    },
    overall_summary: { type: "string" },
  },
  required: ["clarity", "confidence", "repetition", "length", "overall_summary"],
  additionalProperties: false,
} as const;

const MONTHLY_LIMIT = 5;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "feedback_not_configured" }, { status: 501 });
  }

  const { id: questionId } = await params;
  const { answer } = (await request.json()) as { answer: string };
  if (!answer || typeof answer !== "string" || answer.trim().length < 20) {
    return NextResponse.json({ error: "invalid_answer" }, { status: 400 });
  }
  if (answer.length > 4000) {
    return NextResponse.json({ error: "answer_too_long" }, { status: 400 });
  }

  // Burst guard -- the real quota is the monthly DB count below.
  const burst = checkRateLimit(`feedback-burst:${user.id}`, 5, 60 * 1000);
  if (!burst.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const admin = getSupabaseAdmin();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: monthlyCount, error: countErr } = await admin
    .from("answer_feedback")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", thirtyDaysAgo);

  if (countErr) return NextResponse.json({ error: "server_error" }, { status: 500 });
  if ((monthlyCount ?? 0) >= MONTHLY_LIMIT) {
    return NextResponse.json({ error: "monthly_limit_reached" }, { status: 429 });
  }

  const { data: question } = await admin
    .from("interview_questions")
    .select("text")
    .eq("id", questionId)
    .maybeSingle();
  if (!question) return NextResponse.json({ error: "question_not_found" }, { status: 404 });

  const anthropic = new Anthropic();
  let feedback: unknown;
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Interview question: "${question.text}"\n\nDraft answer:\n${answer.trim()}`,
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: FEEDBACK_SCHEMA },
      },
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "no_feedback" }, { status: 502 });
    }
    feedback = JSON.parse(textBlock.text);
  } catch {
    return NextResponse.json({ error: "feedback_failed" }, { status: 502 });
  }

  const { error: insertErr } = await admin.from("answer_feedback").insert({
    user_id: user.id,
    question_id: questionId,
    answer_snapshot: answer.trim(),
    feedback_json: feedback,
  });
  if (insertErr) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ feedback, remaining: MONTHLY_LIMIT - (monthlyCount ?? 0) - 1 });
}
