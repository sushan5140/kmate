"use client";

import { useState } from "react";
import { AlertTriangle, Sparkles, Bookmark, HelpCircle } from "lucide-react";
import { Card, MicroLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OfficialAnswer } from "@/components/gks/official-answer";
import { CommunityAnswers } from "@/components/gks/community-answers";
import { DiscussionThread } from "@/components/gks/discussion-thread";
import { AnswerTypes } from "@/components/gks/answer-types";
import { cn } from "@/lib/cn";
import type { AnswerView, AskResult, DiscussionView, Program, ThreadState } from "@/components/gks/types";

const PROGRAM_LABELS: Record<Program, string> = {
  UG: "Undergraduate (GKS-U)",
  G: "Graduate (GKS-G)",
};

type Tab = "official" | "community" | "discussion";

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "You've asked a lot of questions in a short time — try again in a few minutes.",
  not_configured: "The scholarship assistant isn't set up yet. Try again later.",
  rag_unreachable: "Couldn't reach the assistant service. Try again in a moment.",
  rag_error: "The assistant service had a problem answering that. Try rephrasing your question.",
  invalid_question: "Ask a real question — a few words won't be enough to search on.",
  invalid_program: "Choose Undergraduate or Graduate first.",
};

export function GksAssistant() {
  const [program, setProgram] = useState<Program | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [thread, setThread] = useState<ThreadState | null>(null);
  const [tab, setTab] = useState<Tab>("official");
  const [savePending, setSavePending] = useState(false);
  // Retrieval diagnostics are for local/admin debugging: opt in with ?debug=1
  // rather than putting scores and extraction flags in front of applicants.
  const [showDiagnostics] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug")
  );

  function selectProgram(p: Program) {
    setProgram(p);
    // A UG answer shown under a G selection (or vice versa) would look like
    // it's about the newly-selected program -- clear it rather than leave a
    // stale, now-mislabeled result on screen.
    setResult(null);
    setThread(null);
    setError(null);
  }

  async function ask() {
    const q = question.trim();
    if (!q || !program || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gks/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, program }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(ERROR_MESSAGES[data.error] ?? "Something went wrong. Try again.");
        setResult(null);
        setThread(null);
        return;
      }
      const asked = data as AskResult;
      setResult(asked);
      setThread(asked.thread ?? null);
      // The official layer is the answer with authority, so it always opens
      // first -- even when the community tab has more in it.
      setTab("official");
    } catch {
      setError("Couldn't reach the server.");
      setResult(null);
      setThread(null);
    } finally {
      setLoading(false);
    }
  }

  async function toggleSave() {
    if (!thread || savePending) return;
    setSavePending(true);
    const previous = thread.saved;
    setThread({ ...thread, saved: !previous });
    try {
      const res = await fetch(`/api/gks/questions/${thread.questionId}/save`, { method: "POST" });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as { saved: boolean };
      setThread((t) => (t ? { ...t, saved: data.saved } : t));
    } catch {
      setThread((t) => (t ? { ...t, saved: previous } : t));
    } finally {
      setSavePending(false);
    }
  }

  const answers: AnswerView[] = thread?.answers ?? [];
  const discussion: DiscussionView[] = thread?.discussion ?? [];
  const showResult = result && !result.needs_clarification;

  const TABS: { key: Tab; label: string; count: number | null }[] = [
    { key: "official", label: "Official answer", count: null },
    { key: "community", label: "Community answers", count: answers.length },
    { key: "discussion", label: "Discussion", count: discussion.length },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_268px] lg:items-start">
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <div>
            <MicroLabel>Program (required)</MicroLabel>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(Object.keys(PROGRAM_LABELS) as Program[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => selectProgram(p)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[13px] font-medium",
                    program === p
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-white text-muted"
                  )}
                >
                  {PROGRAM_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") ask();
            }}
            placeholder="e.g. My university does not issue a transcript. Can I use marksheets?"
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-primary"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-muted">
              {program ? "Ctrl/Cmd + Enter to ask" : "Choose a program above first"}
            </p>
            <Button onClick={ask} disabled={loading || !program || question.trim().length < 3}>
              {loading ? "Asking…" : "Ask"}
            </Button>
          </div>
          {error && <p className="text-[13px] text-danger">{error}</p>}
        </Card>

        {result?.needs_clarification && (
          <Card className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <div>
              <p className="text-[14px] font-medium text-ink">{result.clarification}</p>
              <p className="mt-1 text-[13px] text-muted">
                Add a little more detail and ask again — that way the answer comes from the right part of the
                guideline instead of a guess.
              </p>
            </div>
          </Card>
        )}

        {showResult && result && (
          <>
            <Card className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 gap-2.5">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-snug text-ink">{result.question}</p>
                  <p className="mt-1 text-[12px] text-muted">
                    {PROGRAM_LABELS[result.program]}
                    {thread && thread.askCount > 1 ? ` · asked ${thread.askCount} times` : ""}
                  </p>
                </div>
              </div>
              {thread && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={toggleSave}
                  disabled={savePending}
                  aria-pressed={thread.saved}
                >
                  <Bookmark className={cn("h-3.5 w-3.5", thread.saved && "fill-current")} />
                  {thread.saved ? "Saved" : "Save question"}
                </Button>
              )}
            </Card>

            <div>
              <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline pb-3">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    aria-pressed={tab === t.key}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[13px] font-medium",
                      tab === t.key ? "bg-primary text-white" : "text-muted hover:bg-canvas hover:text-ink"
                    )}
                  >
                    {t.label}
                    {t.count !== null && t.count > 0 && (
                      <span
                        className={cn(
                          "ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                          tab === t.key ? "bg-white/20" : "bg-ink/[0.08] text-ink"
                        )}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <Card className="mt-4">
                {tab === "official" && <OfficialAnswer result={result} />}
                {tab === "community" && (
                  <CommunityAnswers
                    questionId={thread?.questionId ?? null}
                    answers={answers}
                    conflict={result.conflict}
                    onAnswers={(next) => setThread((t) => (t ? { ...t, answers: next } : t))}
                  />
                )}
                {tab === "discussion" && (
                  <DiscussionThread
                    questionId={thread?.questionId ?? null}
                    discussion={discussion}
                    onDiscussion={(next) => setThread((t) => (t ? { ...t, discussion: next } : t))}
                  />
                )}
              </Card>
            </div>

            {!thread && (
              <p className="text-[12.5px] text-muted">
                Voting, saving and discussion are unavailable for this answer — it couldn&apos;t be saved to
                your question history. The answer above is unaffected.
              </p>
            )}

            <Card>
              <MicroLabel>What you should do</MicroLabel>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink">
                {result.official_sources_found === 0
                  ? "This hasn't been officially confirmed yet. Check the current NIIED/embassy/university guidelines or ask your embassy directly before relying on community reports."
                  : "Cross-check this against the official source(s) above for your specific cycle and embassy/university before relying on it — requirements change between years."}
              </p>
            </Card>

            {/* Local/admin only (?debug=1). Everything an operator needs to
                judge a bad answer, without any of it reaching the applicant. */}
            {showDiagnostics && (
              <Card>
                <MicroLabel>Retrieval diagnostics (debug)</MicroLabel>
                <p className="mt-1 text-[12px] text-muted">
                  mode={result.mode} · program={result.program} · question={thread?.questionId ?? "unsaved"} ·
                  concepts=[{result.coverage.question_concepts.join(", ")}] · covered=[
                  {result.coverage.covered.join(", ")}] · unsupported=[{result.coverage.unsupported.join(", ")}]
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[11.5px] font-medium text-muted">
                    <Sparkles className="h-3.5 w-3.5" />
                    {result.mode === "rag_generated" ? "AI-assisted" : "Retrieval only"}
                  </span>
                  <span className="text-[11.5px] text-muted">
                    {result.official_sources_found} official · {result.community_cases_found} community cases
                  </span>
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-[12px]">
                    <thead className="text-muted">
                      <tr>
                        <th className="py-1 pr-3 font-medium">layer</th>
                        <th className="py-1 pr-3 font-medium">score</th>
                        <th className="py-1 pr-3 font-medium">prog</th>
                        <th className="py-1 pr-3 font-medium">category</th>
                        <th className="py-1 pr-3 font-medium">source / page</th>
                        <th className="py-1 pr-3 font-medium">quality</th>
                      </tr>
                    </thead>
                    <tbody className="text-ink">
                      {result.evidence.official.map((o, i) => (
                        <tr key={`o${i}`} className="border-t border-hairline">
                          <td className="py-1 pr-3">official</td>
                          <td className="py-1 pr-3 tabular-nums">{o.score.toFixed(3)}</td>
                          <td className="py-1 pr-3">{o.program}</td>
                          <td className="py-1 pr-3">{o.category}</td>
                          <td className="py-1 pr-3">
                            {o.source_title} p.{o.page}
                          </td>
                          <td className="py-1 pr-3">
                            {o.content_type}/{o.extraction_quality}
                          </td>
                        </tr>
                      ))}
                      {result.evidence.community.map((c, i) => (
                        <tr key={`c${i}`} className="border-t border-hairline">
                          <td className="py-1 pr-3">community</td>
                          <td className="py-1 pr-3 tabular-nums">{c.score.toFixed(3)}</td>
                          <td className="py-1 pr-3">{c.program}</td>
                          <td className="py-1 pr-3">{c.category}</td>
                          <td className="py-1 pr-3">{c.cluster_id}</td>
                          <td className="py-1 pr-3">
                            {c.answer_confidence}
                            {c.possible_conflict ? " · conflict" : ""}
                            {c.answers?.[0]?.usefulness ? ` · ${c.answers[0].usefulness}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      <div className="lg:sticky lg:top-6">
        <AnswerTypes />
      </div>
    </div>
  );
}
