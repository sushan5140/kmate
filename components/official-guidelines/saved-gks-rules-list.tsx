"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  ExternalLink,
  MessageCircleQuestion,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  readSavedGksRules,
  reconcileSavedGksRules,
  removeGksRule,
  pushAccountSavedGksRules,
  type SavedGksRule,
} from "@/lib/gks/saved-rules";

function fmt(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Saved";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SavedGksRulesList() {
  const [items, setItems] = useState<SavedGksRule[]>([]);

  useEffect(() => {
    const sync = () => setItems(readSavedGksRules());
    sync();
    void reconcileSavedGksRules().then(setItems);
    window.addEventListener("storage", sync);
    window.addEventListener("kmate:gks-rules-changed", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("kmate:gks-rules-changed", sync as EventListener);
    };
  }, []);

  const grouped = useMemo(
    () => ({
      guideline: items.filter((item) => item.kind === "guideline_rule"),
      ai: items.filter((item) => item.kind === "ai_answer"),
    }),
    [items]
  );

  if (items.length === 0) {
    return (
      <Card className="mt-5 text-center">
        <Bookmark className="mx-auto h-5 w-5 text-muted" />
        <p className="mt-2 text-[14px] font-semibold text-ink">No saved GKS rules yet</p>
        <p className="mx-auto mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">
          Use the Save button beside a guideline rule or AI answer. Saved items sync to your KMate account and keep a browser cache for offline fallback.
        </p>
        <Link
          href="/gks"
          className="mt-4 inline-flex h-9 items-center rounded-full bg-ink px-4 text-[12px] font-medium text-white"
        >
          Back to GKS Assistant
        </Link>
      </Card>
    );
  }

  const renderGroup = (label: string, group: SavedGksRule[]) => {
    if (group.length === 0) return null;
    return (
      <section className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
            {label}
          </h2>
          <span className="text-[11.5px] text-muted">{group.length} saved</span>
        </div>

        <div className="mt-2 grid gap-3">
          {group.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-semibold text-ink">{item.title}</p>
                    {item.page && (
                      <span className="rounded-full bg-canvas px-2 py-0.5 text-[10.5px] font-medium text-muted">
                        {item.page}
                      </span>
                    )}
                  </div>
                  {item.question && (
                    <p className="mt-1 text-[11.5px] font-medium text-primary">
                      Question: {item.question}
                    </p>
                  )}
                  <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-muted">
                    {item.text}
                  </p>
                  <p className="mt-2 text-[10.5px] text-muted/70">Saved {fmt(item.savedAt)}</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = removeGksRule(item.id);
                    setItems(next);
                    void pushAccountSavedGksRules(next);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[11px] font-medium text-danger ring-1 ring-hairline-strong hover:bg-canvas"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-hairline pt-3">
                <Link
                  href={
                    "/gks?program=UG&q=" +
                    encodeURIComponent(
                      item.question ??
                        `Explain this saved 2027 GKS-U rule using only the official guideline: ${item.title}. ${item.text}`
                    )
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[11.5px] font-medium text-white"
                >
                  <MessageCircleQuestion className="h-3.5 w-3.5" />
                  Ask AI
                </Link>
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[11.5px] font-medium text-ink ring-1 ring-hairline-strong hover:bg-canvas"
                  >
                    Official source <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>
    );
  };

  return (
    <>
      {renderGroup("Guideline rules", grouped.guideline)}
      {renderGroup("Saved AI answers", grouped.ai)}
    </>
  );
}
