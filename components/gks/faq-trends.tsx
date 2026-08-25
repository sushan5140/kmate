"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Search, Bookmark, TrendingUp, ShieldCheck } from "lucide-react";
import { Card, MicroLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { FaqEntry, FaqTrends, Period, ProgramFilter, TrackFilter } from "@/lib/gks/faq";

const PERIOD_LABELS: Record<Period, string> = {
  week: "This week",
  month: "This month",
  all: "All time",
};

/** Opening an FAQ asks it in the Assistant rather than duplicating the answer here. */
function assistantHref(entry: FaqEntry): string {
  const program = entry.program === "G" ? "G" : "UG";
  return `/gks?q=${encodeURIComponent(entry.question)}&program=${program}`;
}

function Pill({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1.5 text-[13px] font-medium",
        active ? "bg-primary text-white" : "text-muted hover:bg-canvas hover:text-ink"
      )}
    >
      {children}
    </Link>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
  hint,
}: {
  icon: typeof TrendingUp;
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-muted">{label}</p>
        <p className="mt-0.5 text-[20px] font-semibold leading-none tracking-tight text-ink">{value}</p>
        <p className="mt-1 text-[11.5px] text-muted">{hint}</p>
      </div>
    </Card>
  );
}

export function FaqTrendsView({
  trends,
  filters,
}: {
  trends: FaqTrends;
  filters: { period: Period; program: ProgramFilter; track: TrackFilter; search: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [draft, setDraft] = useState(filters.search);
  const [, startTransition] = useTransition();

  function withParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    return `/faq-trends${next.toString() ? `?${next}` : ""}`;
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    startTransition(() => router.push(withParam("q", draft.trim())));
  }

  const { entries, savedEntries, topics, stats } = trends;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_288px] lg:items-start">
      <div className="flex flex-col gap-5">
        {/* --- filters --------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline pb-3">
          <Pill active={filters.program === "all"} href={withParam("program", "all")}>All</Pill>
          <Pill active={filters.program === "UG"} href={withParam("program", "UG")}>GKS-U</Pill>
          <Pill active={filters.program === "G"} href={withParam("program", "G")}>GKS-G</Pill>
          <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
          <Pill active={filters.track === "embassy"} href={withParam("track", filters.track === "embassy" ? "all" : "embassy")}>
            Embassy
          </Pill>
          <Pill active={filters.track === "university"} href={withParam("track", filters.track === "university" ? "all" : "university")}>
            University
          </Pill>
          <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <Pill key={p} active={filters.period === p} href={withParam("period", p)}>
              {PERIOD_LABELS[p]}
            </Pill>
          ))}
        </div>

        <form onSubmit={submitSearch} className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search questions…"
            className="w-full rounded-xl border border-border bg-white py-2.5 pl-10 pr-4 text-[14px] text-ink outline-none focus:border-primary"
          />
        </form>

        {/* --- stats ------------------------------------------------------ */}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            icon={TrendingUp}
            value={String(stats.liveAsks)}
            label="Asked on KMate"
            hint={`${stats.liveQuestions} question${stats.liveQuestions === 1 ? "" : "s"} · ${PERIOD_LABELS[filters.period].toLowerCase()}`}
          />
          <StatCard
            icon={Bookmark}
            value={String(stats.savedByYou)}
            label="Saved questions"
            hint="by you"
          />
          <StatCard
            icon={ShieldCheck}
            value={String(stats.answeredOfficially)}
            label="Answered officially"
            hint="had official guideline evidence"
          />
        </div>

        {/* --- the list ---------------------------------------------------- */}
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">
              {stats.liveAsks > 0 ? "Most asked questions" : "Questions applicants ask most"}
            </h2>
            <p className="text-[12px] text-muted">
              {entries.length} question{entries.length === 1 ? "" : "s"}
            </p>
          </div>

          {entries.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-muted">
              Nothing matches these filters yet. Try a wider time range, or ask a question in the GKS
              Assistant — it will show up here.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col">
              {entries.map((e) => (
                <li key={e.key} className="border-t border-hairline first:border-t-0">
                  <div className="flex items-center gap-3 py-3">
                    <Link
                      href={assistantHref(e)}
                      className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-ink hover:text-primary"
                    >
                      {e.question}
                      <span className="mt-0.5 block text-[11.5px] text-muted">{e.topic}</span>
                    </Link>
                    {/* A live count and a seed label are mutually exclusive on
                        purpose: the corpus frequencies are not comparable with
                        real KMate asks, so they are never shown as a number. */}
                    {e.asks > 0 ? (
                      <span className="shrink-0 text-[12px] tabular-nums text-muted">
                        {e.asks} ask{e.asks === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                        {e.seedLabel}
                      </span>
                    )}
                    {e.saved && (
                      <Bookmark className="h-3.5 w-3.5 shrink-0 fill-current text-primary" aria-label="Saved" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* --- side panel ---------------------------------------------------- */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-6">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
              <Bookmark className="h-3.5 w-3.5 text-muted" />
              Saved by you
            </h2>
            {savedEntries.length > 0 && (
              <span className="text-[11.5px] text-muted">{savedEntries.length}</span>
            )}
          </div>
          {savedEntries.length === 0 ? (
            <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
              Nothing saved yet. Use <span className="font-medium text-ink">Save question</span> in the GKS
              Assistant and it appears here.
            </p>
          ) : (
            <ul className="mt-2.5 flex flex-col">
              {savedEntries.map((e) => (
                <li key={`saved-${e.key}`} className="border-t border-hairline first:border-t-0">
                  <Link
                    href={assistantHref(e)}
                    className="block py-2.5 text-[12.5px] leading-snug text-ink hover:text-primary"
                  >
                    {e.question}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <MicroLabel>Popular topics</MicroLabel>
          {topics.length === 0 ? (
            <p className="mt-2.5 text-[12px] text-muted">No topics for these filters.</p>
          ) : (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <Link
                  key={t.label}
                  href={withParam("q", filters.search === t.label ? "" : t.label)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[12px] font-medium",
                    filters.search === t.label
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-white text-muted hover:text-ink"
                  )}
                >
                  {t.label}
                  <span className="ml-1 tabular-nums text-muted/70">{t.count}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <p className="px-1 text-[11.5px] leading-relaxed text-muted">
          Questions marked <span className="font-medium text-ink">Frequently asked</span> or{" "}
          <span className="font-medium text-ink">Popular</span> come from the GKS applicant community and
          have no KMate count yet. Counts appear once people ask them here.
        </p>
      </div>
    </div>
  );
}
