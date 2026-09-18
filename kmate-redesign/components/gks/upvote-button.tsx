"use client";

import { useState } from "react";
import { ArrowBigUp } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Upvote-only control for GKS answers and discussion posts.
 *
 * Follows the same optimistic-then-reconcile pattern as the site-wide
 * VoteButtons, but deliberately without a downvote: these are people's
 * reported experiences, and a downvote reads as "your experience is wrong"
 * rather than "this isn't useful here".
 *
 * Kept visually quiet on purpose -- it's a signal, not a scoreboard.
 */
export function UpvoteButton({
  endpoint,
  initialUpvotes,
  initialUpvoted,
  ariaLabel,
}: {
  /** Full path to POST to; toggling is decided server-side. */
  endpoint: string;
  initialUpvotes: number;
  initialUpvoted: boolean;
  ariaLabel: string;
}) {
  const [upvotes, setUpvotes] = useState(initialUpvotes);
  const [upvoted, setUpvoted] = useState(initialUpvoted);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    setPending(true);

    const prevUpvoted = upvoted;
    const prevUpvotes = upvotes;
    setUpvoted(!prevUpvoted);
    setUpvotes(prevUpvotes + (prevUpvoted ? -1 : 1));

    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) throw new Error("vote failed");
      // Trust the server's view over the optimistic guess -- they can differ
      // if the same account voted from another tab.
      const data = (await res.json()) as { upvoted?: boolean };
      if (typeof data.upvoted === "boolean" && data.upvoted !== !prevUpvoted) {
        setUpvoted(data.upvoted);
        setUpvotes(prevUpvotes + (data.upvoted ? 1 : 0) - (prevUpvoted ? 1 : 0));
      }
    } catch {
      setUpvoted(prevUpvoted);
      setUpvotes(prevUpvotes);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={upvoted}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] font-medium tabular-nums transition-colors",
        upvoted
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-white text-muted hover:text-ink"
      )}
    >
      <ArrowBigUp className={cn("h-3.5 w-3.5", upvoted && "fill-current")} />
      {upvotes}
    </button>
  );
}
