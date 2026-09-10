import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { RESEARCH_DIFFICULTIES, RESEARCH_FOCUS_MODES } from "@/lib/research-interview/types";

interface TurnPayload {
  turnIndex: number;
  phase: "main" | "weakness-drill";
  questionText: string;
  questionType: string;
  transcript: string;
  slideNumber: number | null;
  groundingStatus: "supported" | "partially_supported" | "weak" | "unsupported";
  coverageTags: string[];
  evaluation: Record<string, unknown>;
  metrics: Record<string, unknown>;
}

interface SessionPayload {
  paperTitle: string;
  paperFileName: string;
  presentationFileName: string;
  difficulty: string;
  focus: string;
  plannedQuestionCount: number;
  status: "completed" | "abandoned";
  researchReport: Record<string, unknown>;
  deliveryReport: Record<string, unknown>;
  turns: TurnPayload[];
}

const cleanText = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`research-interview-session:${user.id}`, 20, 60 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: SessionPayload;
  try {
    body = (await request.json()) as SessionPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!(RESEARCH_DIFFICULTIES as readonly string[]).includes(body.difficulty)) {
    return NextResponse.json({ error: "invalid_difficulty" }, { status: 400 });
  }
  if (!(RESEARCH_FOCUS_MODES as readonly string[]).includes(body.focus)) {
    return NextResponse.json({ error: "invalid_focus" }, { status: 400 });
  }
  if (!["completed", "abandoned"].includes(body.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  if (!Number.isInteger(body.plannedQuestionCount) || body.plannedQuestionCount < 1 || body.plannedQuestionCount > 20) {
    return NextResponse.json({ error: "invalid_question_count" }, { status: 400 });
  }
  if (!Array.isArray(body.turns) || body.turns.length === 0 || body.turns.length > 24) {
    return NextResponse.json({ error: "invalid_turns" }, { status: 400 });
  }

  const paperTitle = cleanText(body.paperTitle, 500);
  const paperFileName = cleanText(body.paperFileName, 255);
  const presentationFileName = cleanText(body.presentationFileName, 255);
  if (!paperTitle || !paperFileName || !presentationFileName) {
    return NextResponse.json({ error: "missing_metadata" }, { status: 400 });
  }

  const validStatuses = new Set(["supported", "partially_supported", "weak", "unsupported"]);
  for (let i = 0; i < body.turns.length; i++) {
    const turn = body.turns[i];
    if (
      !Number.isInteger(turn.turnIndex) ||
      turn.turnIndex !== i + 1 ||
      !["main", "weakness-drill"].includes(turn.phase) ||
      !validStatuses.has(turn.groundingStatus) ||
      !cleanText(turn.questionText, 4000) ||
      typeof turn.transcript !== "string" ||
      (turn.slideNumber !== null && (!Number.isInteger(turn.slideNumber) || turn.slideNumber < 1)) ||
      !Array.isArray(turn.coverageTags)
    ) {
      return NextResponse.json({ error: "invalid_turn" }, { status: 400 });
    }
  }

  const admin = getSupabaseAdmin();
  const { data: session, error: sessionError } = await admin
    .from("research_interview_sessions")
    .insert({
      user_id: user.id,
      paper_title: paperTitle,
      paper_file_name: paperFileName,
      presentation_file_name: presentationFileName,
      difficulty: body.difficulty,
      focus: body.focus,
      planned_question_count: body.plannedQuestionCount,
      status: body.status,
      research_report: body.researchReport,
      delivery_report: body.deliveryReport,
      ended_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    console.error("research interview session insert failed", sessionError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const { error: turnsError } = await admin.from("research_interview_turns").insert(
    body.turns.map((turn) => ({
      session_id: session.id,
      turn_index: turn.turnIndex,
      phase: turn.phase,
      question_text: cleanText(turn.questionText, 4000),
      question_type: cleanText(turn.questionType, 200),
      transcript: cleanText(turn.transcript, 16000),
      slide_number: turn.slideNumber,
      grounding_status: turn.groundingStatus,
      coverage_tags: turn.coverageTags.slice(0, 32).map((tag) => cleanText(tag, 100)).filter(Boolean),
      evaluation: turn.evaluation,
      metrics: turn.metrics,
    }))
  );

  if (turnsError) {
    console.error("research interview turns insert failed", turnsError);
    await admin.from("research_interview_sessions").delete().eq("id", session.id);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sessionId: session.id });
}
