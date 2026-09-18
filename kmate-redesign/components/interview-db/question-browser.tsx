"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { QuestionCard, type QuestionCardData } from "@/components/interview-db/question-card";
import { DownloadMenu } from "@/components/interview-db/download-menu";
import { cn } from "@/lib/cn";
import { QUESTION_CATEGORIES, QUESTION_CATEGORY_LABELS, type QuestionCategory } from "@/lib/constants";

const PAGE_SIZE = 18;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "pressable rounded-[11px] border px-3 py-2 text-[10.5px] font-extrabold",
        active ? "border-primary/20 bg-primary-soft text-primary" : "border-hairline bg-surface text-muted hover:bg-canvas hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

export function QuestionBrowser({
  questions,
  initialDraftedCount,
  totalApproved,
}: {
  questions: QuestionCardData[];
  initialDraftedCount: number;
  totalApproved: number;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<QuestionCategory | "all">("all");
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [draftedCount, setDraftedCount] = useState(initialDraftedCount);
  const [draftedIds, setDraftedIds] = useState(
    () => new Set(questions.filter((q) => q.draftContent.trim().length > 0).map((q) => q.id))
  );

  function resetPaging() {
    setVisibleCount(PAGE_SIZE);
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return questions.filter((q) => {
      if (category !== "all" && q.category !== category) return false;
      if (unansweredOnly && draftedIds.has(q.id)) return false;
      if (needle && !q.text.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [questions, category, unansweredOnly, search, draftedIds]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const progressPct = totalApproved > 0 ? Math.round((draftedCount / totalApproved) * 100) : 0;

  function handleDraftContentChange(questionId: string, hasContent: boolean) {
    setDraftedIds((prev) => {
      const already = prev.has(questionId);
      if (already === hasContent) return prev;
      const next = new Set(prev);
      if (hasContent) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
    setDraftedCount((c) => c + (hasContent ? 1 : -1));
  }

  return (
    <div>
      <div className="mt-6 rounded-[20px] border border-hairline bg-surface/75 p-4 shadow-card sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-extrabold text-ink">
              {draftedCount} of {totalApproved} drafted
            </span>
            <span className="text-muted">{progressPct}%</span>
          </div>
          <DownloadMenu totalApproved={totalApproved} draftedCount={draftedCount} />
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      </div>

      <div className="mt-4 rounded-[20px] border border-hairline bg-surface/75 p-4 shadow-card sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPaging();
            }}
            placeholder="Search questions…"
            className="w-full rounded-[13px] border border-hairline-strong bg-canvas/55 py-3 pl-10 pr-4 text-[12.5px] font-semibold text-ink outline-none transition-colors focus:border-primary focus:bg-white"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Chip
            active={category === "all"}
            onClick={() => {
              setCategory("all");
              resetPaging();
            }}
          >
            All
          </Chip>
          {QUESTION_CATEGORIES.map((c) => (
            <Chip
              key={c}
              active={category === c}
              onClick={() => {
                setCategory(c);
                resetPaging();
              }}
            >
              {QUESTION_CATEGORY_LABELS[c]}
            </Chip>
          ))}
          <Chip
            active={unansweredOnly}
            onClick={() => {
              setUnansweredOnly((v) => !v);
              resetPaging();
            }}
          >
            Unanswered only
          </Chip>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {visible.length === 0 ? (
          <p className="text-[14px] text-muted">No questions match this filter yet.</p>
        ) : (
          visible.map((q, i) => (
            <QuestionCard
              key={q.id}
              index={i + 1}
              question={q}
              onDraftContentChange={(hasContent) => handleDraftContentChange(q.id, hasContent)}
            />
          ))
        )}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="pressable mt-4 w-full rounded-[13px] border border-hairline-strong bg-surface py-3 text-[11.5px] font-extrabold text-ink hover:bg-canvas"
        >
          Load more ({filtered.length - visible.length} remaining)
        </button>
      )}
    </div>
  );
}
