"use client";

import { useState } from "react";
import { ArrowBigUp } from "lucide-react";

export function UpvoteButton({
  questionId,
  initialCount,
  initialUpvoted,
}: {
  questionId: string;
  initialCount: number;
  initialUpvoted: boolean;
}) {
  const [count, setCount] = useState(initialCount);
  const [upvoted, setUpvoted] = useState(initialUpvoted);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    const wasUpvoted = upvoted;
    // Optimistic update -- revert on failure below.
    setUpvoted(!wasUpvoted);
    setCount((c) => (wasUpvoted ? c - 1 : c + 1));
    try {
      const res = await fetch(`/api/questions/${questionId}/upvote`, { method: "POST" });
      if (!res.ok) {
        setUpvoted(wasUpvoted);
        setCount((c) => (wasUpvoted ? c + 1 : c - 1));
      }
    } catch {
      setUpvoted(wasUpvoted);
      setCount((c) => (wasUpvoted ? c + 1 : c - 1));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-medium ${
        upvoted ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-muted"
      }`}
    >
      <ArrowBigUp className="h-4 w-4" />
      {count}
    </button>
  );
}
