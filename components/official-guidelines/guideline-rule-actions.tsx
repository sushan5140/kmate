"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  isGksRuleSaved,
  toggleGksRule,
  type SavedGksRule,
} from "@/lib/gks/saved-rules";

export function GuidelineRuleActions({
  id,
  title,
  text,
  page,
  sourceUrl,
  askQuestion,
  compact = false,
}: {
  id: string;
  title: string;
  text: string;
  page?: string | null;
  sourceUrl?: string | null;
  askQuestion?: string;
  compact?: boolean;
}) {
  const bookmark: Omit<SavedGksRule, "savedAt"> = useMemo(
    () => ({
      id,
      title,
      text,
      page: page ?? null,
      sourceUrl: sourceUrl ?? null,
      kind: "guideline_rule",
    }),
    [id, title, text, page, sourceUrl]
  );

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sync = () => setSaved(isGksRuleSaved(id));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("kmate:gks-rules-changed", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("kmate:gks-rules-changed", sync as EventListener);
    };
  }, [id]);

  const q =
    askQuestion ??
    `Explain this 2027 GKS-U rule using only the official guideline: ${title}. ${text}`;

  return (
    <div className={cn("flex flex-wrap gap-1.5", compact && "gap-1")}>
      <Link
        href={"/gks?program=UG&q=" + encodeURIComponent(q)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-hairline-strong transition-colors hover:bg-canvas",
          compact ? "h-7 px-2.5 text-[10.5px]" : "h-8 px-3 text-[11.5px]"
        )}
      >
        <MessageCircleQuestion className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Ask AI
      </Link>
      <button
        type="button"
        onClick={() => {
          const next = toggleGksRule(bookmark);
          setSaved(next.saved);
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-hairline-strong transition-colors",
          saved ? "bg-primary/10 text-primary" : "bg-white text-ink hover:bg-canvas",
          compact ? "h-7 px-2.5 text-[10.5px]" : "h-8 px-3 text-[11.5px]"
        )}
        aria-pressed={saved}
      >
        <Bookmark className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5", saved && "fill-current")} />
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
