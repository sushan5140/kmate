"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QUESTION_CATEGORY_LABELS, type QuestionCategory } from "@/lib/constants";

export interface PendingQuestion {
  id: string;
  text: string;
  category: QuestionCategory;
}

export function ModerationQueue({ questions: initial }: { questions: PendingQuestion[] }) {
  const [questions, setQuestions] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function moderate(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/questions/${id}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setQuestions((rows) => rows.filter((q) => q.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (questions.length === 0) {
    return <p className="text-[14px] text-muted">Nothing pending review.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {questions.map((q) => (
        <Card key={q.id} className="flex items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
              {QUESTION_CATEGORY_LABELS[q.category]}
            </span>
            <p className="mt-0.5 text-[14px] text-ink">{q.text}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => moderate(q.id, "approve")} disabled={busyId === q.id}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => moderate(q.id, "reject")}
              disabled={busyId === q.id}
            >
              Reject
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
