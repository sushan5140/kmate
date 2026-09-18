import { ChevronUp, Lock } from "lucide-react";

const CATEGORIES = [
  { label: "All", active: true },
  { label: "Motivation", active: false },
  { label: "Korea-specific", active: false },
  { label: "Major-specific", active: false },
  { label: "Behavioral", active: false },
  { label: "Curveball", active: false },
];

const QUESTIONS = [
  {
    category: "Motivation",
    categoryClass: "bg-primary-soft text-primary",
    text: "Why Korea — and not a scholarship in your own country?",
    votes: 47,
    meta: "asked in 23 interviews",
    selected: true,
  },
  {
    category: "Korea-specific",
    categoryClass: "bg-gks-u/10 text-gks-u",
    text: "What will you do if you fail to reach TOPIK 3 in your language year?",
    votes: 38,
    meta: "asked in 17 interviews",
    selected: false,
  },
  {
    category: "Curveball",
    categoryClass: "bg-danger-soft text-danger",
    text: "Convince me you'll go back home after the degree.",
    votes: 31,
    meta: "asked in 11 interviews",
    selected: false,
  },
];

/**
 * Static two-panel mock of the Interview DB: the question bank on the left,
 * the private autosaving draft editor on the right.
 */
export function InterviewMockup() {
  return (
    <div className="relative select-none overflow-hidden rounded-[28px] bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6" aria-hidden>
      <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORIES.map((c) => (
          <span
            key={c.label}
            className={
              c.active
                ? "rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-white"
                : "rounded-full bg-ink/[0.05] px-2.5 py-1 text-[11px] font-medium text-muted ring-1 ring-hairline"
            }
          >
            {c.label}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
        {/* Question list */}
        <div className="flex flex-col gap-2.5">
          {QUESTIONS.map((q) => (
            <div
              key={q.text}
              className={
                q.selected
                  ? "rounded-2xl bg-canvas/70 p-4 ring-2 ring-primary/40"
                  : "rounded-2xl bg-canvas/70 p-4 ring-1 ring-hairline"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${q.categoryClass}`}>
                  {q.category}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.05] px-2 py-0.5 text-[11px] font-semibold text-ink ring-1 ring-hairline">
                  <ChevronUp className="h-3 w-3" /> {q.votes}
                </span>
              </div>
              <p className="mt-2 text-[13px] font-semibold leading-snug text-ink">
                &ldquo;{q.text}&rdquo;
              </p>
              <p className="mt-1.5 text-[11px] text-muted">{q.meta}</p>
            </div>
          ))}
        </div>

        {/* Draft editor */}
        <div className="flex flex-col rounded-2xl p-4 ring-1 ring-primary/25" style={{ background: "var(--color-primary-soft)" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-primary">
              <Lock className="h-3 w-3" /> Your draft
            </span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-[10.5px] font-semibold text-success shadow-xs">
              Saved 2s ago
            </span>
          </div>
          <p className="mt-2.5 flex-1 text-[12.5px] leading-relaxed text-ink/80">
            Korea&apos;s biotech funding model is the honest answer — my field
            barely exists at home yet. The personal answer started with a lab
            internship in Daejeon, where our team&apos;s work depended on a paper
            out of KAIST, and I realized every reference I was reading
            <span className="draft-caret" />
          </p>
          <p className="mt-3 border-t border-primary/15 pt-2.5 text-[11px] leading-snug text-muted">
            Drafts are visible to exactly one person: you. Not connections,
            not admins, not anyone.
          </p>
        </div>
      </div>
    </div>
  );
}
