"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, Sparkles, ShieldCheck, TriangleAlert } from "lucide-react";
import type { AskResult } from "@/components/gks/types";
import {
  isGksRuleSaved,
  pushAccountSavedGksRules,
  reconcileSavedGksRules,
  toggleGksRule,
  type SavedGksRule,
} from "@/lib/gks/saved-rules";

function stableId(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return "ai-answer-" + Math.abs(hash).toString(36);
}

export function CombinedAnswer({ result }: { result: AskResult }) {
  const aiWorked = result.synthesis_provider === "grok";
  const id = useMemo(() => stableId(result.program + ":" + result.question), [result.program, result.question]);
  const [saved, setSaved] = useState(false);

  const pages = useMemo(() => {
    const values = result.evidence.official
      .map((item) => item.page)
      .filter((page): page is number => typeof page === "number");
    const unique = [...new Set(values)];
    return unique.length ? unique.map((page) => "p." + page).join(", ") : null;
  }, [result.evidence.official]);

  const sourceUrl = result.evidence.official.find((item) => item.source_url)?.source_url ?? null;

  const bookmark: Omit<SavedGksRule, "savedAt"> = useMemo(
    () => ({
      id,
      title: result.question,
      text: result.answer,
      page: pages,
      sourceUrl,
      kind: "ai_answer",
      question: result.question,
    }),
    [id, pages, result.answer, result.question, sourceUrl]
  );

  useEffect(() => {
    const sync = () => setSaved(isGksRuleSaved(id));
    sync();
    void reconcileSavedGksRules().then(sync);
    window.addEventListener("storage", sync);
    window.addEventListener("kmate:gks-rules-changed", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("kmate:gks-rules-changed", sync as EventListener);
    };
  }, [id]);

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

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11.5px] font-medium text-primary">
          <ShieldCheck className="h-3.5 w-3.5" />
          {result.guideline_cycle
            ? result.guideline_cycle + " official guideline"
            : "Official guideline"}
        </span>

        <button
          type="button"
          onClick={() => {
            const next = toggleGksRule(bookmark);
            setSaved(next.saved);
            void pushAccountSavedGksRules(next.items);
          }}
          className={
            "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] font-medium ring-1 ring-hairline-strong " +
            (saved ? "bg-primary/10 text-primary" : "bg-white text-ink hover:bg-canvas")
          }
          aria-pressed={saved}
        >
          <Bookmark className={"h-3 w-3 " + (saved ? "fill-current" : "")} />
          {saved ? "Saved to GKS Rules" : "Save answer"}
        </button>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Applicant anecdotes and community RAG results are not used to generate this answer.
      </p>
    </section>
  );
}
