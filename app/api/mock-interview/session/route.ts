import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { MOCK_INTERVIEW_CATEGORIES } from "@/lib/mock-interview/constants";

interface QuestionPayload {
  questionIndex: number;
  questionText: string;
  transcript: string;
  refinedAnswer: string | null;
  eyeContactPct: number;
  wpm: number;
  fillerCount: number;
  longPauseCount: number;
  longestPauseSec: number;
  postureStability: number | null;
  durationSec: number;
}

interface SessionPayload {
  category: string;
  questionCount: number;
  maxMidPauses: number;
  midPausesUsed: number;
  status: string;
  finalFeedbackText: string | null;
  questions: QuestionPayload[];
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`mock-interview-session:${user.id}`, 20, 60 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = (await request.json()) as SessionPayload;

  if (!(MOCK_INTERVIEW_CATEGORIES as readonly string[]).includes(body.category)) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }
  if (!["completed", "abandoned"].includes(body.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  if (!Array.isArray(body.questions) || body.questions.length === 0) {
    return NextResponse.json({ error: "no_questions" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: session, error: sessionError } = await admin
    .from("interview_sessions")
    .insert({
      user_id: user.id,
      category: body.category,
      question_count: body.questionCount,
      max_mid_pauses: body.maxMidPauses,
      mid_pauses_used: body.midPausesUsed,
      status: body.status,
      final_feedback_text: body.finalFeedbackText,
      ended_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const { error: questionsError } = await admin.from("interview_session_questions").insert(
    body.questions.map((q) => ({
      session_id: session.id,
      question_index: q.questionIndex,
      question_text: q.questionText,
      transcript: q.transcript,
      refined_answer: q.refinedAnswer,
      eye_contact_pct: q.eyeContactPct,
      wpm: q.wpm,
      filler_count: q.fillerCount,
      long_pause_count: q.longPauseCount,
      longest_pause_sec: q.longestPauseSec,
      posture_stability: q.postureStability,
      duration_sec: q.durationSec,
    }))
  );

  if (questionsError) {
    // Session row exists but its questions failed -- clean up the orphan so
    // history doesn't show a blank interview with no per-question data.
    await admin.from("interview_sessions").delete().eq("id", session.id);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sessionId: session.id });
}
