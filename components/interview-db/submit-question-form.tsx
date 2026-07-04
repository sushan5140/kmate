"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QUESTION_CATEGORIES, QUESTION_CATEGORY_LABELS, type QuestionCategory } from "@/lib/constants";

export function SubmitQuestionForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [category, setCategory] = useState<QuestionCategory>("motivation");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, category }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "rate_limited" ? "You've submitted a few already -- try again later." : "Couldn't submit. Check your question and try again.");
        return;
      }
      setSubmitted(true);
      setText("");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Submit a question
      </Button>
    );
  }

  return (
    <Card>
      <p className="text-[13.5px] font-medium text-ink">Submit a question</p>
      <p className="mt-1 text-[12.5px] text-muted">
        Reviewed by an admin before it appears publicly.
      </p>

      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as QuestionCategory)}
        className="mt-3 h-9 w-full rounded-lg border border-border bg-white px-2 text-[13px] text-ink"
      >
        {QUESTION_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {QUESTION_CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 500))}
        rows={3}
        placeholder="What question should other applicants prepare for?"
        className="mt-2 w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-primary"
      />

      {error && <p className="mt-1.5 text-[12.5px] text-red-600">{error}</p>}
      {submitted && <p className="mt-1.5 text-[12.5px] text-success">Submitted for review.</p>}

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={submit} disabled={submitting || text.trim().length < 8}>
          {submitting ? "Submitting…" : "Submit"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
