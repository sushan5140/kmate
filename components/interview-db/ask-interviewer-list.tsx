"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { UpvoteButton } from "@/components/interview-db/upvote-button";
import { ReportBlockMenu } from "@/components/profile/report-block-menu";
import { cn } from "@/lib/cn";
import { QUESTION_CATEGORIES, QUESTION_CATEGORY_LABELS, QUESTION_CATEGORY_BADGE_CLASS, type QuestionCategory } from "@/lib/constants";

export interface AskQuestionData {
  id: string;
  text: string;
  category: QuestionCategory;
  upvotesCount: number;
  upvotedByMe: boolean;
}

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

export function AskInterviewerList({ questions }: { questions: AskQuestionData[] }) {
  const [category, setCategory] = useState<QuestionCategory | "all">("all");

  const filtered = category === "all" ? questions : questions.filter((q) => q.category === category);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={category === "all"} onClick={() => setCategory("all")}>
          All
        </Chip>
        {QUESTION_CATEGORIES.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {QUESTION_CATEGORY_LABELS[c]}
          </Chip>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {filtered.length === 0 ? (
          <p className="text-[14px] text-muted">No questions match this filter yet.</p>
        ) : (
          filtered.map((q) => (
            <Card key={q.id} className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide",
                    QUESTION_CATEGORY_BADGE_CLASS[q.category]
                  )}
                >
                  {QUESTION_CATEGORY_LABELS[q.category]}
                </span>
                <p className="text-[14.5px] text-ink">{q.text}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <UpvoteButton questionId={q.id} initialCount={q.upvotesCount} initialUpvoted={q.upvotedByMe} />
                <ReportBlockMenu targetType="question" targetId={q.id} />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
