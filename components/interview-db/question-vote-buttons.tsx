"use client";

import { useState } from "react";
import { ArrowBigUp, ArrowBigDown } from "lucide-react";
import { cn } from "@/lib/cn";

type VoteType = "up" | "down" | null;

export function QuestionVoteButtons({
  questionId,
  initialUpvotes,
  initialDownvotes,
  initialVoteType,
}: {
  questionId: string;
  initialUpvotes: number;
  initialDownvotes: number;
  initialVoteType: VoteType;
}) {
  const [upvotes, setUpvotes] = useState(initialUpvotes);
  const [downvotes, setDownvotes] = useState(initialDownvotes);
  const [voteType, setVoteType] = useState<VoteType>(initialVoteType);
  const [loading, setLoading] = useState(false);

  async function cast(direction: "up" | "down") {
    if (loading) return;
    setLoading(true);

    const prevVoteType = voteType;
    const prevUpvotes = upvotes;
    const prevDownvotes = downvotes;

    // Optimistic update -- covers all three transitions: casting a fresh
    // vote, clearing the current one (clicking the same direction again),
    // and switching direction. Reverted below on failure.
    const next: VoteType = prevVoteType === direction ? null : direction;
    setVoteType(next);
    let nextUpvotes = prevUpvotes;
    let nextDownvotes = prevDownvotes;
    if (prevVoteType === "up") nextUpvotes -= 1;
    if (prevVoteType === "down") nextDownvotes -= 1;
    if (next === "up") nextUpvotes += 1;
    if (next === "down") nextDownvotes += 1;
    setUpvotes(nextUpvotes);
    setDownvotes(nextDownvotes);

    try {
      const res = await fetch(`/api/questions/${questionId}/${direction}vote`, { method: "POST" });
      if (!res.ok) {
        setVoteType(prevVoteType);
        setUpvotes(prevUpvotes);
        setDownvotes(prevDownvotes);
      }
    } catch {
      setVoteType(prevVoteType);
      setUpvotes(prevUpvotes);
      setDownvotes(prevDownvotes);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => cast("up")}
        aria-pressed={voteType === "up"}
        className={cn(
          "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-medium",
          voteType === "up" ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-muted"
        )}
      >
        <ArrowBigUp className="h-4 w-4" />
        {upvotes}
      </button>
      <button
        type="button"
        onClick={() => cast("down")}
        aria-pressed={voteType === "down"}
        className={cn(
          "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-medium",
          voteType === "down" ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-muted"
        )}
      >
        <ArrowBigDown className="h-4 w-4" />
        {downvotes}
      </button>
    </div>
  );
}
