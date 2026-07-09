"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { QuestionCard, type QuestionCardData } from "@/components/interview-db/question-card";
import { cn } from "@/lib/cn";
import { QUESTION_CATEGORIES, QUESTION_CATEGORY_LABELS, type QuestionCategory } from "@/lib/constants";

const PAGE_SIZE = 18;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[12.5px] font-medium",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-muted"
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
      <div className="mt-6">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium text-ink">
            {draftedCount} of {totalApproved} drafted
          </span>
          <span className="text-muted">{progressPct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
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
            className="w-full rounded-xl border border-border bg-white py-2.5 pl-10 pr-4 text-[14px] text-ink outline-none focus:border-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
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

      <div className="mt-6 flex flex-col gap-3">
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
          className="mt-4 w-full rounded-xl border border-border bg-white py-2.5 text-[13.5px] font-medium text-ink hover:bg-canvas"
        >
          Load more ({filtered.length - visible.length} remaining)
        </button>
      )}
    </div>
  );
}
