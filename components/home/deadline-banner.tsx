"use client";
import { useMemo } from "react";
import { calendarBanner, type CalendarSelection } from "@/lib/deadlines/calendar-banner";
import { useUtcDateKey } from "@/lib/hooks/use-date-key";
import type { LiveVerifiedDeadline } from "@/lib/deadlines/live-schema";

export function DeadlineBannerText({ selection, liveDeadlines }: { selection: CalendarSelection; liveDeadlines: LiveVerifiedDeadline[] }) {
  const dateKey = useUtcDateKey();
  const copy = useMemo(() => {
    void dateKey;
    return calendarBanner(selection, liveDeadlines);
  }, [selection, liveDeadlines, dateKey]);
  return <>
    <h2 className="mt-1 text-[19px] font-semibold leading-snug">{copy.title}</h2>
    <p className="mt-1 text-[13.5px] text-white/70">{copy.detail}</p>
    {copy.source && <a href={copy.source} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[12px] font-medium text-white underline">Official source</a>}
  </>;
}
