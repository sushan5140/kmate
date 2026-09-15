import "server-only";

interface OfficialEvidence {
  claim?: string | null;
  source_title?: string | null;
  source_url?: string | null;
  cycle?: string | null;
  page?: number | null;
  extraction_quality?: "clean" | "needs_review" | null;
}

export interface SynthesisInput {
  question: string;
  program: "UG" | "G";
  official: OfficialEvidence[];
  unsupportedLabels?: string[];
}

export interface SynthesisResult {
  answer: string;
  provider: "grok" | "retrieval";
  providerStatus:
    | "ok"
    | "missing_key"
    | "xai_auth_error"
    | "xai_rate_limited"
    | "xai_error"
    | "empty_response"
    | "timeout_or_network";
}

function trim(text: string, max = 460) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : compact.slice(0, max - 1).trimEnd() + "…";
}

function retrievalFallback(input: SynthesisInput, status: SynthesisResult["providerStatus"]): SynthesisResult {
  const lines: string[] = [];

  if (input.official.length) {
    lines.push("Official guideline evidence");
    for (const item of input.official.slice(0, 4)) {
      const page = item.page ? ` (p.${item.page})` : "";
      lines.push(`• ${trim(item.claim ?? "")}${page}`);
    }
  } else {
    lines.push("The current official guideline evidence retrieved by KMate does not directly answer this question.");
  }

  if (input.unsupportedLabels?.length) {
    lines.push("");
    lines.push(
      `The guideline evidence retrieved here does not explicitly confirm: ${input.unsupportedLabels.join(", ")}.`
    );
  }

  return { answer: lines.join("\n"), provider: "retrieval", providerStatus: status };
}

export async function synthesizeGksAnswer(input: SynthesisInput): Promise<SynthesisResult> {
  const apiKey =
    process.env.XAI_API_KEY ??
    process.env.GROK_API_KEY ??
    process.env.GROK_API ??
    process.env.Grok_API;

  if (!apiKey) return retrievalFallback(input, "missing_key");

  const official = input.official.slice(0, 6).map((item) => ({
    claim: item.claim,
    page: item.page,
    cycle: item.cycle,
    source_title: item.source_title,
    source_url: item.source_url,
    extraction_quality: item.extraction_quality,
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "x-grok-conv-id": "kmate-gks-guidelines",
      },
      body: JSON.stringify({
        model: process.env.GROK_MODEL ?? "grok-4.6",
        temperature: 0.1,
        max_tokens: 650,
        messages: [
          {
            role: "system",
            content: [
              "You are KMate's official GKS guideline assistant.",
              "Answer ONLY from the official guideline evidence supplied in this request.",
              "Do not use applicant anecdotes, community reports, memory, web knowledge, or unstated assumptions.",
              "For GKS-U, the evidence is from the current 2027 GKS-U guideline.",
              "If the evidence does not directly support an answer, say that the guideline evidence provided does not confirm it.",
              "Prefer a direct yes/no first when the question allows it.",
              "Then explain the rule in 2-4 concise sentences and cite the supplied page number(s) as 'p.X'.",
              "Do not invent deadlines, document rules, exceptions, scores, university requirements, or interpretations.",
              "Where two stages differ, state the distinction explicitly (for example first round versus NIIED second round).",
              "Evidence marked extraction_quality='clean' is reviewed structured evidence and takes priority.",
              "Evidence marked extraction_quality='needs_review' is a page-level locator fallback from the earlier English attachment baseline. Use it only when it directly supports a broad point, never to override clean evidence, and avoid inventing details not present in its summary.",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              question: input.question,
              program: input.program,
              official_guideline_evidence: official,
              unsupported_topics: input.unsupportedLabels ?? [],
            }),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const safeBody = (await response.text().catch(() => "")).slice(0, 500);
      console.error("[gks:grok] xAI request failed", response.status, safeBody);
      if (response.status === 401 || response.status === 403) {
        return retrievalFallback(input, "xai_auth_error");
      }
      if (response.status === 429) {
        return retrievalFallback(input, "xai_rate_limited");
      }
      return retrievalFallback(input, "xai_error");
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      console.error("[gks:grok] xAI returned no answer content");
      return retrievalFallback(input, "empty_response");
    }

    return { answer, provider: "grok", providerStatus: "ok" };
  } catch (error) {
    console.error(
      "[gks:grok] request exception",
      error instanceof Error ? error.name + ": " + error.message : "unknown"
    );
    return retrievalFallback(input, "timeout_or_network");
  } finally {
    clearTimeout(timeout);
  }
}
