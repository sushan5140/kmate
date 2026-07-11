"use client";

import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "@/lib/hooks/use-debounced-callback";
import { AnswerFeedback } from "@/components/interview-db/answer-feedback";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function DraftAnswerEditor({
  questionId,
  initialContent,
  rows = 8,
  onContentChange,
}: {
  questionId: string;
  initialContent: string;
  rows?: number;
  /** Fires only when content crosses the empty/non-empty boundary, so a parent can track a live drafted-count without re-checking every keystroke. */
  onContentChange?: (hasContent: boolean) => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hadContentRef = useRef(initialContent.trim().length > 0);

  async function save(value: string) {
    setStatus("saving");
    try {
      const res = await fetch(`/api/questions/${questionId}/draft-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: value }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data = (await res.json()) as { savedAt: string };
      setStatus("saved");
      setSavedAt(data.savedAt);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  const { debounced, flush } = useDebouncedCallback(save, 2500);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  function handleChange(value: string) {
    setContent(value);
    debounced(value);
    const hasContent = value.trim().length > 0;
    if (hasContent !== hadContentRef.current) {
      hadContentRef.current = hasContent;
      onContentChange?.(hasContent);
    }
  }

  return (
    <div>
      <textarea
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => flush(content)}
        rows={rows}
        placeholder="Draft your answer here -- only you can see this."
        className="w-full resize-y rounded-xl border border-border bg-white px-4 py-3 text-[14px] leading-relaxed text-ink outline-none focus:border-primary"
      />
      <p className="mt-1.5 text-[12.5px] text-muted">
        {status === "saving" && "Saving…"}
        {status === "saved" && (
          <span className="text-success">
            Saved{savedAt && ` · ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </span>
        )}
        {status === "error" && (
          <span className="text-red-600">
            Couldn&apos;t save.{" "}
            <button type="button" className="underline" onClick={() => flush(content)}>
              Retry
            </button>
          </span>
        )}
        {status === "idle" && "Autosaves as you type."}
      </p>
      <div className="mt-2">
        <AnswerFeedback questionId={questionId} answer={content} />
      </div>
    </div>
  );
}
