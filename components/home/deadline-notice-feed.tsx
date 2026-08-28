"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, ExternalLink, History, Megaphone } from "lucide-react";
import { Card, MicroLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { getApplicationNotices } from "@/lib/deadlines";

/**
 * Deadlines and notices for the saved application.
 *
 * The one rule this component exists to hold: a GKS deadline is only ever
 * shown because an official source states it. Nothing is estimated from a
 * previous cycle, and a date that has passed can never be presented as a
 * countdown -- the matcher separates upcoming from historical, and the two are
 * rendered differently on purpose.
 *
 * The cycle is passed in from the applicant's own profile rather than defaulted
 * to the dataset's cycle. That is what stops a 2027 applicant being shown 2026
 * dates: asking for a cycle KMate holds no records for correctly yields
 * nothing, instead of silently falling back to the last cycle that had data.
 */

export interface AttentionInput {
  /** Required documents the applicant marked Missing, from the readiness store. */
  missing: number;
  /** Required documents with no progress state yet, from the same store. */
  untracked: number;
  /** Where to send them to act on it. */
  readinessHref: string;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

const NOTICE_TYPE: Record<string, string> = {
  guideline: "Guideline",
  result: "Result",
  schedule_change: "Schedule change",
  deadline: "Deadline",
  other: "Notice",
};

export function DeadlineNoticeFeed({
  program,
  track,
  cycle,
  attention,
}: {
  program: "GKS-U" | "GKS-G";
  track?: "embassy" | "university";
  /** The applicant's own cycle. Never defaulted to the dataset's. */
  cycle: string;
  attention: AttentionInput;
}) {
  const feed = useMemo(
    () => getApplicationNotices({ program, ...(track ? { track } : {}), cycle }),
    [program, track, cycle]
  );

  const next = feed.upcoming[0] ?? null;
  const notices = feed.notices.slice(0, 3);
  const past = feed.historical;

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------- next verified deadline ---------------- */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <CalendarClock className="h-3.5 w-3.5 text-primary" />
          </span>
          <MicroLabel>Next verified deadline</MicroLabel>
        </div>

        {next ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold leading-snug text-ink">{next.label}</p>
                <p className="mt-0.5 text-[13px] text-muted">{formatDate(next.deadline)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[12px] font-semibold text-primary">
                {next.daysUntil === 0
                  ? "due today"
                  : `${next.daysUntil} day${next.daysUntil === 1 ? "" : "s"} remaining`}
              </span>
            </div>
            {next.notes && <p className="text-[12.5px] leading-relaxed text-muted">{next.notes}</p>}
            <SourceLink url={next.source.url} label={next.source.title} publisher={next.source.publisher} />
          </>
        ) : (
          <div>
            <p className="text-[14px] font-medium text-ink">No upcoming verified deadline</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              The next official date has not been published in KMate&apos;s verified sources. Dates are never
              estimated from a previous cycle — check the official notices for your round.
            </p>
          </div>
        )}

        {/* Local embassy timetables are set per country and are not the same as
            NIIED's. KMate holds no verified embassy dates, so it says so
            rather than implying the date above applies locally. */}
        <p className="border-t border-hairline pt-3 text-[11.5px] leading-relaxed text-muted">
          Local embassy deadline not verified — your embassy sets its own timetable, which is usually earlier
          than NIIED&apos;s. Confirm it with the embassy handling your application.
        </p>
      </Card>

      {/* ---------------- needs attention ---------------- */}
      {(attention.missing > 0 || attention.untracked > 0 || next) && (
        <Card className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold/10">
              <AlertTriangle className="h-3.5 w-3.5 text-gold" />
            </span>
            <MicroLabel>Needs attention</MicroLabel>
          </div>
          <ul className="flex flex-col gap-1.5">
            {attention.missing > 0 && (
              <Item>
                <span className="font-medium text-ink">{attention.missing}</span> required document
                {attention.missing === 1 ? "" : "s"} marked missing
              </Item>
            )}
            {attention.untracked > 0 && (
              <Item>
                <span className="font-medium text-ink">{attention.untracked}</span> required document
                {attention.untracked === 1 ? "" : "s"} not yet tracked
              </Item>
            )}
            {next && (
              <Item>
                {next.label} —{" "}
                <span className="font-medium text-ink">
                  {next.daysUntil === 0 ? "due today" : `${next.daysUntil} days remaining`}
                </span>
              </Item>
            )}
          </ul>
          <Link
            href={attention.readinessHref}
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline"
          >
            Open your checklist
            <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      )}

      {/* ---------------- recent notices ---------------- */}
      {notices.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas">
                <Megaphone className="h-3.5 w-3.5 text-muted" />
              </span>
              <MicroLabel>Recent GKS notices</MicroLabel>
            </div>
            <Link href="/notices" className="text-[12.5px] font-medium text-primary hover:underline">
              Official Notices board
            </Link>
          </div>
          <ul className="flex flex-col gap-2.5">
            {notices.map((n) => (
              <li key={n.id} className="border-t border-hairline pt-2.5 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[10.5px] font-medium text-muted">
                    {NOTICE_TYPE[n.type] ?? "Notice"}
                  </span>
                  <span className="text-[11.5px] text-muted">{formatDate(n.published_at)}</span>
                </div>
                <p className="mt-1 text-[13.5px] font-medium leading-snug text-ink">{n.title}</p>
                <SourceLink url={n.source.url} label={n.source.title} publisher={n.source.publisher} compact />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ---------------- past verified dates ---------------- */}
      {past.length > 0 && (
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-muted" />
            <MicroLabel>Past verified dates</MicroLabel>
          </div>
          {/* Rendered as a plain record of what has already happened -- no
              countdown, no urgency styling. */}
          <ul className="flex flex-col gap-1">
            {past.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]">
                <span className="text-muted">{d.label}</span>
                <span className="text-muted">{formatDate(d.deadline)} · passed</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return <li className="text-[12.5px] leading-relaxed text-muted">· {children}</li>;
}

function SourceLink({
  url,
  label,
  publisher,
  compact,
}: {
  url: string;
  label: string;
  publisher: string;
  compact?: boolean;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate font-medium text-primary hover:underline",
        compact ? "mt-1 text-[12px]" : "text-[12.5px]"
      )}
      title={label}
    >
      <span className="truncate">{publisher}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}
