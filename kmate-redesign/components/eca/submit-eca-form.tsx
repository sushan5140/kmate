"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ECA_TRACKS, ECA_TRACK_LABELS, type EcaTrack } from "@/lib/constants";

export function SubmitEcaForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [track, setTrack] = useState<EcaTrack>("both");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/eca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, track }),
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
        Submit an ECA
      </Button>
    );
  }

  return (
    <Card>
      <p className="text-[13.5px] font-medium text-ink">Submit an extracurricular</p>
      <p className="mt-1 text-[12.5px] text-muted">Reviewed by an admin before it appears publicly.</p>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 120))}
        placeholder="e.g. Korean language certificate (TOPIK)"
        className="mt-3 h-9 w-full rounded-lg border border-border bg-white px-3 text-[13.5px] text-ink outline-none focus:border-primary"
      />

      <select
        value={track}
        onChange={(e) => setTrack(e.target.value as EcaTrack)}
        className="mt-2 h-9 w-full rounded-lg border border-border bg-white px-2 text-[13px] text-ink"
      >
        {ECA_TRACKS.map((t) => (
          <option key={t} value={t}>
            {ECA_TRACK_LABELS[t]}
          </option>
        ))}
      </select>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value.slice(0, 500))}
        rows={3}
        placeholder="How did this help, or how would you use it?"
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
