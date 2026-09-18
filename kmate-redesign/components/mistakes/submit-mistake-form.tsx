"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  MISTAKE_DOCUMENT_TYPES,
  MISTAKE_DOCUMENT_TYPE_LABELS,
  MISTAKE_REASON_CATEGORIES,
  MISTAKE_REASON_CATEGORY_LABELS,
  type MistakeDocumentType,
  type MistakeReasonCategory,
} from "@/lib/constants";

export function SubmitMistakeForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [documentType, setDocumentType] = useState<MistakeDocumentType>("sop");
  const [reasonCategory, setReasonCategory] = useState<MistakeReasonCategory>("generic_sop");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, documentType, reasonCategory }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "rate_limited" ? "You've submitted a few already -- try again later." : "Couldn't submit. Check your entry and try again.");
        return;
      }
      setSubmitted(true);
      setTitle("");
      setDescription("");
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
        Share a mistake
      </Button>
    );
  }

  return (
    <Card>
      <p className="text-[13.5px] font-medium text-ink">Share an application mistake</p>
      <p className="mt-1 text-[12.5px] text-muted">
        Reviewed by an admin before it appears publicly. Focus on what went wrong and why -- not blame.
      </p>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 120))}
        placeholder="e.g. Apostille rejected for missing consular stamp"
        className="mt-3 h-9 w-full rounded-lg border border-border bg-white px-3 text-[13.5px] text-ink outline-none focus:border-primary"
      />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value as MistakeDocumentType)}
          className="h-9 w-full rounded-lg border border-border bg-white px-2 text-[13px] text-ink"
        >
          {MISTAKE_DOCUMENT_TYPES.map((d) => (
            <option key={d} value={d}>
              {MISTAKE_DOCUMENT_TYPE_LABELS[d]}
            </option>
          ))}
        </select>
        <select
          value={reasonCategory}
          onChange={(e) => setReasonCategory(e.target.value as MistakeReasonCategory)}
          className="h-9 w-full rounded-lg border border-border bg-white px-2 text-[13px] text-ink"
        >
          {MISTAKE_REASON_CATEGORIES.map((r) => (
            <option key={r} value={r}>
              {MISTAKE_REASON_CATEGORY_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value.slice(0, 500))}
        rows={3}
        placeholder="What happened, and what would you do differently?"
        className="mt-2 w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-primary"
      />

      {error && <p className="mt-1.5 text-[12.5px] text-red-600">{error}</p>}
      {submitted && <p className="mt-1.5 text-[12.5px] text-success">Submitted for review.</p>}

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={submit} disabled={submitting || title.trim().length < 4}>
          {submitting ? "Submitting…" : "Submit"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
