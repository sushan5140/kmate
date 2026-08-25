"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UpvoteButton } from "@/components/gks/upvote-button";
import { relativeTime } from "@/lib/relative-time";
import type { DiscussionView } from "@/components/gks/types";

/**
 * Compact applicant discussion.
 *
 * One level of nesting only -- a reply to a reply is attached to the thread
 * root by the API. Threading is carried by a hairline rule and an indent
 * rather than avatars-and-boxes, so a long thread stays legible on a phone.
 */
export function DiscussionThread({
  questionId,
  discussion,
  onDiscussion,
}: {
  questionId: string | null;
  discussion: DiscussionView[];
  onDiscussion: (posts: DiscussionView[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(body: string, parentId: string | null) {
    if (!questionId || body.trim().length < 2 || posting) return;

    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/gks/questions/${questionId}/discussion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), parentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error === "rate_limited"
            ? "You've posted a lot just now — try again shortly."
            : "Couldn't post that. Try again."
        );
        return;
      }
      const data = (await res.json()) as { discussion: DiscussionView[] };
      onDiscussion(data.discussion);
      if (parentId) {
        setReplyDraft("");
        setReplyTo(null);
      } else {
        setDraft("");
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setPosting(false);
    }
  }

  function Post({ post: p, isReply }: { post: DiscussionView; isReply: boolean }) {
    return (
      <div className={isReply ? "border-l border-hairline pl-3.5" : undefined}>
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13px] font-medium text-ink">{p.authorName}</span>
              {p.authorMeta && <span className="text-[11.5px] text-muted">{p.authorMeta}</span>}
              <span className="text-[11.5px] text-muted">{relativeTime(p.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{p.body}</p>
            {!isReply && questionId && (
              <button
                type="button"
                onClick={() => {
                  setReplyTo(replyTo === p.id ? null : p.id);
                  setReplyDraft("");
                }}
                className="mt-1.5 text-[12px] font-medium text-muted hover:text-ink"
              >
                {replyTo === p.id ? "Cancel" : "Reply"}
              </button>
            )}
          </div>
          <UpvoteButton
            endpoint={`/api/gks/discussion/${p.id}/upvote`}
            initialUpvotes={p.upvotes}
            initialUpvoted={p.hasUpvoted}
            ariaLabel={`Upvote reply by ${p.authorName}`}
          />
        </div>

        {p.replies.length > 0 && (
          <div className="mt-3 flex flex-col gap-3">
            {p.replies.map((r) => (
              <Post key={r.id} post={r} isReply />
            ))}
          </div>
        )}

        {replyTo === p.id && (
          <div className="mt-2.5 border-l border-hairline pl-3.5">
            <textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value.slice(0, 2000))}
              placeholder="Reply…"
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={() => post(replyDraft, p.id)} disabled={posting || replyDraft.trim().length < 2}>
                {posting ? "Posting…" : "Reply"}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Discussion</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
          <MessageCircle className="h-3 w-3" />
          {discussion.length} thread{discussion.length === 1 ? "" : "s"}
        </span>
      </div>

      {discussion.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-muted">
          No discussion yet. Ask a follow-up, or add what your university or embassy told you.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {discussion.map((p) => (
            <li key={p.id} className="border-t border-hairline py-3.5 first:border-t-0 first:pt-0">
              <Post post={p} isReply={false} />
            </li>
          ))}
        </ul>
      )}

      {questionId && (
        <div className="mt-4 border-t border-hairline pt-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            placeholder="Continue the discussion…"
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={() => post(draft, null)} disabled={posting || draft.trim().length < 2}>
              {posting ? "Posting…" : "Continue discussion"}
            </Button>
          </div>
          {error && <p className="mt-1.5 text-[12.5px] text-danger">{error}</p>}
        </div>
      )}
    </section>
  );
}
