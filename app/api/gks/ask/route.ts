import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { retrieveGksU2027, guidelineCoverage } from "@/lib/gks/guideline-retriever";
import { synthesizeGksAnswer } from "@/lib/gks/grok-synthesis";
import {
  upsertQuestion,
  loadDiscussion,
  isQuestionSaved,
  countRecentGksAsks,
} from "@/lib/gks/store";

interface RagOfficialEvidence {
  layer: "official";
  score: number;
  program?: "UG" | "G" | null;
  category?: string | null;
  claim?: string | null;
  source_title?: string | null;
  source_url?: string | null;
  cycle?: string | null;
  page?: number | null;
  content_type?: "table_row" | "prose" | null;
  extraction_quality?: "clean" | "needs_review" | null;
}

type Program = "UG" | "G";

interface RagAskResponse {
  coverage?: {
    question_concepts: string[];
    covered: string[];
    unsupported: string[];
    unsupported_labels: string[];
  };
  evidence?: {
    official?: RagOfficialEvidence[];
  };
}

/**
 * GKS-U is now guideline-only:
 *
 *   question -> current 2027 official guideline retrieval -> Grok -> answer
 *
 * No applicant/community RAG material is sent to the model or rendered as
 * evidence. The older RAG service is used only for GKS-G official-guideline
 * retrieval until that program is migrated to the same structured source
 * layer; its community evidence is discarded.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`gks-ask:${user.id}`, 20, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retry_after_seconds: rateLimit.retryAfterSeconds },
      { status: 429 }
    );
  }

  const admin = getSupabaseAdmin();
  const persistentCount = await countRecentGksAsks(
    admin,
    user.id,
    new Date(Date.now() - 60 * 60 * 1000).toISOString()
  );
  if (persistentCount !== null && persistentCount >= 20) {
    return NextResponse.json(
      { error: "rate_limited", retry_after_seconds: 60 * 60 },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (question.length < 3 || question.length > 2000) {
    return NextResponse.json({ error: "invalid_question" }, { status: 400 });
  }

  const program: Program | null =
    body?.program === "UG" || body?.program === "G" ? body.program : null;
  if (!program) {
    return NextResponse.json({ error: "invalid_program" }, { status: 400 });
  }

  let official: RagOfficialEvidence[] = [];
  let coverage: {
    question_concepts: string[];
    covered: string[];
    unsupported: string[];
    unsupported_labels: string[];
  };

  if (program === "UG") {
    official = retrieveGksU2027(question, 5);
    coverage = guidelineCoverage(
      question,
      official as ReturnType<typeof retrieveGksU2027>
    );
  } else {
    // Graduate support remains official-guideline-only. The legacy service is
    // temporarily used as a retriever, but none of its community corpus is
    // included in the model input or response.
    const ragUrl = process.env.GKS_RAG_URL;
    if (!ragUrl) {
      return NextResponse.json({ error: "graduate_guideline_not_configured" }, { status: 501 });
    }

    let upstream: Response;
    try {
      upstream = await fetch(`${ragUrl}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, program }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      return NextResponse.json({ error: "graduate_guideline_unreachable" }, { status: 502 });
    }

    if (!upstream.ok) {
      return NextResponse.json({ error: "graduate_guideline_error" }, { status: 502 });
    }

    const retrieved = (await upstream.json()) as RagAskResponse;
    official = retrieved.evidence?.official ?? [];
    coverage =
      retrieved.coverage ?? {
        question_concepts: [],
        covered: [],
        unsupported: [],
        unsupported_labels: [],
      };
  }

  if (official.length === 0) {
    return NextResponse.json({
      question,
      program,
      answer: "",
      mode: "needs_clarification",
      needs_clarification: true,
      clarification:
        "I couldn't find a sufficiently direct rule in the official guideline for that wording. Add the application stage, document, track, or university detail and ask again.",
      official_sources_found: 0,
      community_cases_found: 0,
      coverage,
      evidence: { official: [], community: [] },
      thread: null,
    });
  }

  const synthesis = await synthesizeGksAnswer({
    question,
    program,
    official,
    unsupportedLabels: coverage.unsupported_labels ?? [],
  });

  const data = {
    question,
    program,
    answer: synthesis.answer,
    mode:
      synthesis.provider === "grok"
        ? ("grok_generated" as const)
        : ("retrieval_only" as const),
    synthesis_provider: synthesis.provider,
    synthesis_status: synthesis.providerStatus,
    guideline_cycle: program === "UG" ? "2027" : official[0]?.cycle ?? null,
    needs_clarification: false,
    official_sources_found: official.length,
    community_cases_found: 0,
    coverage,
    conflict: {
      community_internal: false,
      against_official: false,
    },
    evidence: {
      official,
      community: [],
    },
  };

  try {
    const { id: questionId, askCount } = await upsertQuestion(admin, {
      program,
      question,
      userId: user.id,
      officialAnswer: data.answer,
      officialSources: official,
    });

    const viewerIsAdmin = await isAuthorizedAdmin(user);
    const [discussion, saved] = await Promise.all([
      loadDiscussion(admin, questionId, user.id, viewerIsAdmin),
      isQuestionSaved(admin, questionId, user.id),
    ]);

    return NextResponse.json({
      ...data,
      thread: {
        questionId,
        askCount,
        saved,
        answers: [],
        discussion,
      },
    });
  } catch {
    return NextResponse.json({ ...data, thread: null });
  }
}
