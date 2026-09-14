import "server-only";

interface OfficialEvidence {
  claim?: string | null;
  source_title?: string | null;
  source_url?: string | null;
  cycle?: string | null;
  page?: number | null;
}

interface CommunityEvidence {
  question?: string | null;
  answer_confidence?: string | null;
  possible_conflict?: boolean;
  answers?: Array<{
    text?: string | null;
    usefulness?: string | null;
  }>;
}

export interface SynthesisInput {
  question: string;
  program: "UG" | "G";
  official: OfficialEvidence[];
  community: CommunityEvidence[];
  unsupportedLabels?: string[];
  conflict?: {
    community_internal?: boolean;
    against_official?: boolean;
  };
}

export interface SynthesisResult {
  answer: string;
  provider: "grok" | "retrieval";
}

function trim(text: string, max = 420) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : compact.slice(0, max - 1).trimEnd() + "…";
}

function retrievalFallback(input: SynthesisInput): SynthesisResult {
  const lines: string[] = [];

  if (input.official.length) {
    lines.push("Official guideline");
    for (const item of input.official.slice(0, 3)) {
      const page = item.page ? ` (p.${item.page})` : "";
      lines.push(`• ${trim(item.claim ?? "")}${page}`);
    }
  } else {
    lines.push("Official guideline");
    lines.push("• The current guideline evidence retrieved by KMate does not directly answer this.");
  }

  const communityAnswers = input.community
    .flatMap((item) => item.answers ?? [])
    .filter((item) => item.text)
    .slice(0, 2);

  if (communityAnswers.length) {
    lines.push("");
    lines.push("Applicant experience");
    for (const item of communityAnswers) {
      lines.push(`• ${trim(item.text ?? "")}`);
    }
  }

  if (input.unsupportedLabels?.length) {
    lines.push("");
    lines.push(
      `The current official evidence does not explicitly confirm: ${input.unsupportedLabels.join(", ")}.`
    );
  }

  if (input.conflict?.against_official) {
    lines.push("");
    lines.push("Some applicant reports conflict with the official guideline; follow the official guideline.");
  } else if (input.conflict?.community_internal) {
    lines.push("");
    lines.push("Applicant reports are mixed on this point.");
  }

  return { answer: lines.join("\n"), provider: "retrieval" };
}

export async function synthesizeGksAnswer(input: SynthesisInput): Promise<SynthesisResult> {
  // Accept the name the user has used in other KMate-family projects, while
  // also supporting xAI's conventional environment-variable name.
  const apiKey =
    process.env.XAI_API_KEY ??
    process.env.GROK_API_KEY ??
    process.env.GROK_API ??
    process.env.Grok_API;

  if (!apiKey) return retrievalFallback(input);

  const official = input.official.slice(0, 6).map((item) => ({
    claim: item.claim,
    page: item.page,
    cycle: item.cycle,
    source_title: item.source_title,
    source_url: item.source_url,
  }));

  const community = input.community.slice(0, 3).map((item) => ({
    question: item.question,
    confidence: item.answer_confidence,
    possible_conflict: item.possible_conflict,
    answers: (item.answers ?? []).slice(0, 2).map((a) => ({
      text: a.text,
      usefulness: a.usefulness,
    })),
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROK_MODEL ?? "grok-4.6",
        temperature: 0.15,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content: [
              "You are the KMate GKS scholarship assistant.",
              "Use only the supplied evidence.",
              "The official guideline evidence is authoritative and always outranks community experience.",
              "Community evidence is applicant experience, never an official rule.",
              "For GKS-U, the supplied official evidence is from the current 2027 guideline.",
              "If official evidence does not explicitly answer part of the question, say that clearly instead of inferring.",
              "If community reports conflict with official evidence, say so and follow the official evidence.",
              "Keep the answer concise, practical, and easy to read.",
              "Use this structure: Answer; Official basis; Community experience (only if useful); What to do next.",
              "Do not invent deadlines, document rules, university requirements, scores, or exceptions.",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              question: input.question,
              program: input.program,
              current_official_evidence: official,
              rag_community_evidence: community,
              official_gaps: input.unsupportedLabels ?? [],
              conflict: input.conflict ?? {},
            }),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) return retrievalFallback(input);

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) return retrievalFallback(input);

    return { answer, provider: "grok" };
  } catch {
    return retrievalFallback(input);
  } finally {
    clearTimeout(timeout);
  }
}
