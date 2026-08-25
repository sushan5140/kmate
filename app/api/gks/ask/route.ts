import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  upsertQuestion,
  syncCommunityAnswers,
  loadAnswers,
  loadDiscussion,
  isQuestionSaved,
} from "@/lib/gks/store";

interface RagEvidenceItem {
  layer: "official" | "community";
  score: number;
  [key: string]: unknown;
}

type Program = "UG" | "G";

interface RagAskResponse {
  question: string;
  program: Program;
  answer: string;
  mode: "retrieval_only" | "rag_generated" | "needs_clarification";
  official_sources_found: number;
  community_cases_found: number;
  /** Which parts of the question the retrieved official text actually addresses. */
  coverage: {
    question_concepts: string[];
    covered: string[];
    unsupported: string[];
    unsupported_labels: string[];
  };
  evidence: {
    official: RagEvidenceItem[];
    community: RagEvidenceItem[];
  };
}

/**
 * Server-side only -- the GKS RAG service (gks-rag/, a separate Python
 * process) is never called directly from the browser, so its base URL and
 * (if the service is later given one) its own OpenAI key never reach the
 * client. This route just authenticates, rate-limits, validates, and
 * forwards; the RAG service owns evidence retrieval and answer generation.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`gks-ask:${user.id}`, 20, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const ragUrl = process.env.GKS_RAG_URL;
  if (!ragUrl) {
    return NextResponse.json({ error: "not_configured" }, { status: 501 });
  }

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (question.length < 3 || question.length > 2000) {
    return NextResponse.json({ error: "invalid_question" }, { status: 400 });
  }
  const program: Program | null = body?.program === "UG" || body?.program === "G" ? body.program : null;
  if (!program) {
    return NextResponse.json({ error: "invalid_program" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${ragUrl}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, program }),
      // The RAG service is a plain TF-IDF retriever unless someone's set an
      // OpenAI key on it -- either way this should resolve in well under a
      // few seconds. A generous ceiling just guards against it hanging.
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return NextResponse.json({ error: "rag_unreachable" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "rag_error" }, { status: 502 });
  }

  const data = (await upstream.json()) as RagAskResponse;

  // A clarification isn't an answer to anything yet, so there is no thread to
  // open -- persisting it would fill the question bank (and the upcoming FAQ
  // Trends counts) with half-formed queries.
  if (data.mode === "needs_clarification") {
    return NextResponse.json(data);
  }

  // Persistence is what makes the answer votable, discussable and saveable.
  // It is deliberately non-fatal: if it fails, the applicant still gets the
  // official and community evidence they asked for, just without the
  // interactive layer, rather than an error page.
  try {
    const admin = getSupabaseAdmin();
    const { id: questionId, askCount } = await upsertQuestion(admin, {
      program,
      question,
      userId: user.id,
      officialAnswer: data.answer ?? null,
      officialSources: data.evidence?.official ?? [],
    });

    const ragRank = await syncCommunityAnswers(
      admin,
      questionId,
      (data.evidence?.community ?? []) as unknown as Parameters<typeof syncCommunityAnswers>[2]
    );

    // Resolved once, server-side, from the session -- the browser is never
    // asked whether it is an admin.
    const viewerIsAdmin = await isAuthorizedAdmin(user);

    const [answers, discussion, saved] = await Promise.all([
      loadAnswers(admin, questionId, user.id, ragRank, viewerIsAdmin),
      loadDiscussion(admin, questionId, user.id, viewerIsAdmin),
      isQuestionSaved(admin, questionId, user.id),
    ]);

    return NextResponse.json({
      ...data,
      thread: { questionId, askCount, saved, answers, discussion },
    });
  } catch {
    return NextResponse.json({ ...data, thread: null });
  }
}
