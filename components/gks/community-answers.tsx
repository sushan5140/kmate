"use client";

import { useState } from "react";
import { AlertTriangle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UpvoteButton } from "@/components/gks/upvote-button";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/cn";
import type { AnswerView, ConflictInfo } from "@/components/gks/types";

/** Monogram stand-in for an avatar. Imports have no picture and never will. */
function Monogram({ name, muted }: { name: string; muted: boolean }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-medium",
        muted ? "bg-canvas text-muted" : "bg-primary/10 text-primary"
      )}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function CommunityAnswers({
  questionId,
  answers,
  conflict,
  onAnswers,
}: {
  questionId: string | null;
  answers: AnswerView[];
  conflict?: ConflictInfo;
  onAnswers: (answers: AnswerView[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post() {
    const body = draft.trim();
    if (!questionId || body.length < 2 || posting) return;

    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/gks/questions/${questionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
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
      const data = (await res.json()) as { answers: AnswerView[] };
      onAnswers(data.answers);
      setDraft("");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Community answers</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
          <Users className="h-3 w-3" />
          Applicant experience — not official
        </span>
      </div>

      {(conflict?.community_internal || conflict?.against_official) && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-gold/10 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <p className="text-[13px] leading-relaxed text-ink">
            {conflict?.against_official
              ? "Some replies below disagree with the official guideline above. Follow the official guideline."
              : "Applicants reported mixed experiences on this point."}
          </p>
        </div>
      )}

      {answers.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-muted">
          No closely matching community answer yet. If you&apos;ve been through this, your answer would be the
          first.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {answers.map((a) => {
            const isImport = a.origin === "community_import";
            return (
              <li key={a.id} className="border-t border-hairline py-3.5 first:border-t-0 first:pt-0">
                <div className="flex items-start gap-2.5">
                  <Monogram name={a.authorName} muted={isImport} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[13px] font-medium text-ink">{a.authorName}</span>
                      {a.authorMeta && <span className="text-[11.5px] text-muted">{a.authorMeta}</span>}
                      {/* Deliberately quiet, and deliberately not naming the
                          source platform: it tells the reader this wasn't
                          written on KMate without turning the row into a
                          provenance label. */}
                      {isImport && (
                        <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[10.5px] font-medium text-muted">
                          Community import
                        </span>
                      )}
                      {/* Imports carry no reliable timestamp, so none is shown
                          rather than inventing one from the import date. */}
                      {a.createdAt && (
                        <span className="text-[11.5px] text-muted">{relativeTime(a.createdAt)}</span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{a.body}</p>
                  </div>
                  <UpvoteButton
                    endpoint={`/api/gks/answers/${a.id}/upvote`}
                    initialUpvotes={a.upvotes}
                    initialUpvoted={a.hasUpvoted}
                    ariaLabel={`Upvote answer by ${a.authorName}`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {questionId && (
        <div className="mt-4 border-t border-hairline pt-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
            placeholder="Share what actually happened for you — what you submitted, and what they accepted."
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[11.5px] text-muted">Posted under your KMate name.</p>
            <Button size="sm" onClick={post} disabled={posting || draft.trim().length < 2}>
              {posting ? "Posting…" : "Post answer"}
            </Button>
          </div>
          {error && <p className="mt-1.5 text-[12.5px] text-danger">{error}</p>}
        </div>
      )}
    </section>
  );
}
