import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { retrieveGksU2027, guidelineCoverage } from "@/lib/gks/guideline-retriever";
import { synthesizeGksAnswer } from "@/lib/gks/grok-synthesis";
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
  needs_clarification?: boolean;
  clarification?: string;
  official_sources_found: number;
  community_cases_found: number;
  conflict?: {
    community_internal: boolean;
    against_official: boolean;
  };
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
 * One applicant question deliberately hits TWO evidence paths:
 *
 * 1) the current-cycle guideline layer (2027 GKS-U is retrieved locally from
 *    reviewed, structured facts extracted from the official PDF), and
 * 2) the existing KMate RAG service, which supplies community experience and
 *    the existing GKS corpus.
 *
 * Grok, when configured, is only the synthesis layer. It never gets to invent
 * facts: the current guideline is authoritative and community RAG evidence is
 * clearly separated as applicant experience.
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

  // Current-cycle official retrieval happens independently from the RAG call.
  // That prevents an archived 2026 UG source inside the older RAG index from
  // being presented as the current 2027 rule.
  const currentOfficial = program === "UG" ? retrieveGksU2027(question, 6) : null;

  let upstream: Response;
  try {
    upstream = await fetch(`${ragUrl}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, program }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return NextResponse.json({ error: "rag_unreachable" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "rag_error" }, { status: 502 });
  }

  const rag = (await upstream.json()) as RagAskResponse;

  // If the RAG service says the question is too vague AND the current 2027
  // guideline retriever also found nothing, ask for clarification rather than
  // synthesizing noise.
  if (
    rag.mode === "needs_clarification" &&
    (!currentOfficial || currentOfficial.length === 0)
  ) {
    return NextResponse.json(rag);
  }

  const official =
    program === "UG"
      ? currentOfficial ?? []
      : rag.evidence?.official ?? [];

  const community = rag.evidence?.community ?? [];

  const coverage =
    program === "UG"
      ? guidelineCoverage(question, official as ReturnType<typeof retrieveGksU2027>)
      : rag.coverage;

  // The old UG RAG conflict flag was evaluated against its archived official
  // source. For 2027 UG we keep only the community-internal signal and let the
  // synthesis compare community text against the current guideline evidence.
  const conflict =
    program === "UG"
      ? {
          community_internal: Boolean(rag.conflict?.community_internal),
          against_official: false,
        }
      : rag.conflict ?? {
          community_internal: false,
          against_official: false,
        };

  const synthesis = await synthesizeGksAnswer({
    question,
    program,
    official,
    community,
    unsupportedLabels: coverage?.unsupported_labels ?? [],
    conflict,
  });

  const data = {
    question,
    program,
    answer: synthesis.answer,
    mode: synthesis.provider === "grok" ? ("grok_generated" as const) : ("retrieval_only" as const),
    synthesis_provider: synthesis.provider,
    guideline_cycle: program === "UG" ? "2027" : null,
    needs_clarification: false,
    official_sources_found: official.length,
    community_cases_found: community.length,
    coverage,
    conflict,
    evidence: {
      official,
      community,
    },
  };

  try {
    const admin = getSupabaseAdmin();
    const { id: questionId, askCount } = await upsertQuestion(admin, {
      program,
      question,
      userId: user.id,
      officialAnswer: data.answer ?? null,
      officialSources: data.evidence.official ?? [],
    });

    const ragRank = await syncCommunityAnswers(
      admin,
      questionId,
      (data.evidence.community ?? []) as unknown as Parameters<typeof syncCommunityAnswers>[2]
    );

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
