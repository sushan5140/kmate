"use client";

import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "@/lib/hooks/use-debounced-callback";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function DraftAnswerEditor({ questionId, initialContent }: { questionId: string; initialContent: string }) {
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setStatus("saved");
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
  }

  return (
    <div>
      <textarea
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => flush(content)}
        rows={8}
        placeholder="Draft your answer here -- only you can see this."
        className="w-full resize-y rounded-xl border border-border bg-white px-4 py-3 text-[14px] leading-relaxed text-ink outline-none focus:border-primary"
      />
      <p className="mt-1.5 text-[12.5px] text-muted">
        {status === "saving" && "Saving…"}
        {status === "saved" && <span className="text-success">Saved</span>}
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
    </div>
  );
}
