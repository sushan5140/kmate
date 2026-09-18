"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { QuestionCard, type QuestionCardData } from "@/components/interview-db/question-card";
import { DownloadMenu } from "@/components/interview-db/download-menu";
import { cn } from "@/lib/cn";
import {
  QUESTION_CATEGORIES,
  QUESTION_CATEGORY_LABELS,
  type QuestionCategory,
} from "@/lib/constants";

const PAGE_SIZE = 18;

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "pressable rounded-[9px] border px-3 py-2 text-[10.5px] font-extrabold",
        active
          ? "border-primary bg-primary text-white shadow-xs"
          : "border-border bg-white text-muted hover:border-primary/20 hover:bg-primary-soft hover:text-primary"
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
    setDraftedCount((count) => count + (hasContent ? 1 : -1));
  }

  return (
    <div>
      <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="rounded-[16px] border border-border bg-white p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-primary">Draft progress</p>
              <p className="mt-1 text-[13px] font-extrabold text-ink">
                {draftedCount} of {totalApproved} drafted
              </p>
            </div>
            <span className="text-[12px] font-extrabold text-primary">{progressPct}%</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.055]">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="flex items-center rounded-[16px] border border-border bg-white px-4 py-3 shadow-card">
          <DownloadMenu totalApproved={totalApproved} draftedCount={draftedCount} />
        </div>
      </div>

      <div className="mt-3 rounded-[16px] border border-border bg-white p-4 shadow-card">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/65" />
          <input
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPaging();
            }}
            placeholder="Search questions…"
            className="w-full rounded-[11px] border border-border bg-canvas/70 py-3 pl-10 pr-4 text-[12px] font-semibold text-ink outline-none focus:border-primary focus:bg-white"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Chip active={category === "all"} onClick={() => { setCategory("all"); resetPaging(); }}>
            All
          </Chip>
          {QUESTION_CATEGORIES.map((item) => (
            <Chip
              key={item}
              active={category === item}
              onClick={() => {
                setCategory(item);
                resetPaging();
              }}
            >
              {QUESTION_CATEGORY_LABELS[item]}
            </Chip>
          ))}
          <Chip
            active={unansweredOnly}
            onClick={() => {
              setUnansweredOnly((value) => !value);
              resetPaging();
            }}
          >
            Unanswered only
          </Chip>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {visible.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-border bg-white px-5 py-10 text-center xl:col-span-2">
            <p className="text-[12px] font-semibold text-muted">No questions match this filter yet.</p>
          </div>
        ) : (
          visible.map((question, index) => (
            <QuestionCard
              key={question.id}
              index={index + 1}
              question={question}
              onDraftContentChange={(hasContent) => handleDraftContentChange(question.id, hasContent)}
            />
          ))
        )}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          className="pressable mt-4 w-full rounded-[11px] border border-border bg-white py-3 text-[11px] font-extrabold text-primary hover:border-primary/25 hover:bg-primary-soft"
        >
          Load more ({filtered.length - visible.length} remaining)
        </button>
      )}
    </div>
  );
}
