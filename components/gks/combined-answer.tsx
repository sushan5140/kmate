"use client";

import { Sparkles, ShieldCheck, TriangleAlert } from "lucide-react";
import type { AskResult } from "@/components/gks/types";

export function CombinedAnswer({ result }: { result: AskResult }) {
  const aiWorked = result.synthesis_provider === "grok";

  return (
    <section className="rounded-2xl bg-surface p-5 ring-1 ring-hairline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            Official guideline AI
          </p>
          <h2 className="mt-1 text-[15px] font-semibold text-ink">
            Answered only from official GKS guideline evidence
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[11.5px] font-medium text-muted ring-1 ring-hairline">
          {aiWorked ? <Sparkles className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
          {aiWorked ? "Grok · guideline grounded" : "Official excerpts · AI unavailable"}
        </span>
      </div>

      <div className="mt-3 whitespace-pre-line text-[13.5px] leading-7 text-ink">
        {result.answer}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11.5px] font-medium text-primary">
          <ShieldCheck className="h-3.5 w-3.5" />
          {result.guideline_cycle
            ? result.guideline_cycle + " official guideline"
            : "Official guideline"}
        </span>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Applicant anecdotes and community RAG results are not used to generate this answer.
      </p>
    </section>
  );
}
