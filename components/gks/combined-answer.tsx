"use client";

import { Sparkles, ShieldCheck, UsersRound } from "lucide-react";
import type { AskResult } from "@/components/gks/types";

export function CombinedAnswer({ result }: { result: AskResult }) {
  return (
    <section className="rounded-2xl bg-surface p-5 ring-1 ring-hairline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            Combined answer
          </p>
          <h2 className="mt-1 text-[15px] font-semibold text-ink">
            Current guideline + KMate applicant RAG
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[11.5px] font-medium text-muted ring-1 ring-hairline">
          <Sparkles className="h-3.5 w-3.5" />
          {result.synthesis_provider === "grok" ? "Synthesized by Grok" : "Evidence-only synthesis"}
        </span>
      </div>

      <div className="mt-3 whitespace-pre-line text-[13.5px] leading-7 text-ink">
        {result.answer}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11.5px] font-medium text-primary">
          <ShieldCheck className="h-3.5 w-3.5" />
          {result.program === "UG" && result.guideline_cycle
            ? result.guideline_cycle + " official guideline"
            : "Official guideline"}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-2.5 py-1 text-[11.5px] font-medium text-muted">
          <UsersRound className="h-3.5 w-3.5" />
          {result.community_cases_found} RAG community case{result.community_cases_found === 1 ? "" : "s"}
        </span>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Official evidence has priority. Community material is shown only as applicant experience and does not override the guideline.
      </p>
    </section>
  );
}
