"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CachedGksCrossTabRow } from "@/lib/cached-content";

export interface StatRow {
  name: string;
  total: number;
  embassyCount: number;
  universityTrackCount: number;
  distinctOtherCount: number;
  degreeBreakdown: string;
}

// "university" mode: each row is a university, expanding it shows which
// countries its scholars came from. "country" mode is the mirror image.
type Mode = "university" | "country";

export function ExpandableStatTable({ mode, rows }: { mode: Mode; rows: StatRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [breakdowns, setBreakdowns] = useState<Record<string, CachedGksCrossTabRow[] | "loading" | "error">>({});

  async function toggleRow(name: string) {
    if (expanded === name) {
      setExpanded(null);
      return;
    }
    setExpanded(name);
    if (breakdowns[name]) return; // already fetched (or in flight)

    setBreakdowns((prev) => ({ ...prev, [name]: "loading" }));
    try {
      const param = mode === "university" ? `university=${encodeURIComponent(name)}` : `country=${encodeURIComponent(name)}`;
      const res = await fetch(`/api/scholar-stats/breakdown?${param}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { rows: CachedGksCrossTabRow[] };
      setBreakdowns((prev) => ({ ...prev, [name]: data.rows }));
    } catch {
      setBreakdowns((prev) => ({ ...prev, [name]: "error" }));
    }
  }

  const otherLabel = mode === "university" ? "Countries" : "Universities";
  const breakdownOtherLabel = mode === "university" ? "Country" : "University";
  const pctField = mode === "university" ? "pct_of_university_seats" : "pct_of_country_seats";
  const otherField = mode === "university" ? "country" : "university";

  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-hairline">
      <table className="w-full text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-hairline bg-surface">
            <th className="w-6 px-2 py-2"></th>
            <th className="px-3 py-2 font-semibold text-ink">{mode === "university" ? "University" : "Country"}</th>
            <th className="px-3 py-2 font-semibold text-ink">Seats</th>
            <th className="px-3 py-2 font-semibold text-ink">Embassy / Uni-track</th>
            <th className="px-3 py-2 font-semibold text-ink">{otherLabel}</th>
            <th className="px-3 py-2 font-semibold text-ink">Degree levels</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = expanded === r.name;
            const breakdown = breakdowns[r.name];
            return (
              <Fragment key={r.name}>
                <tr
                  onClick={() => toggleRow(r.name)}
                  className="cursor-pointer border-b border-hairline bg-surface last:border-0 hover:bg-canvas"
                >
                  <td className="px-2 py-2 align-top text-muted">
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </td>
                  <td className="px-3 py-2 align-top font-medium text-ink">{r.name}</td>
                  <td className="px-3 py-2 align-top text-ink">{r.total}</td>
                  <td className="px-3 py-2 align-top text-muted">
                    {r.embassyCount} / {r.universityTrackCount}
                  </td>
                  <td className="px-3 py-2 align-top text-muted">{r.distinctOtherCount}</td>
                  <td className="px-3 py-2 align-top text-muted">{r.degreeBreakdown.replace(/;/g, ", ")}</td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-hairline bg-canvas last:border-0">
                    <td colSpan={6} className="px-3 py-3">
                      {breakdown === "loading" && <p className="text-[12px] text-muted">Loading breakdown…</p>}
                      {breakdown === "error" && <p className="text-[12px] text-danger">Couldn&apos;t load the breakdown. Try again.</p>}
                      {breakdown && breakdown !== "loading" && breakdown !== "error" && (
                        <div className="max-w-[520px]">
                          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-[12px]">
                            <span className="font-semibold uppercase tracking-wide text-muted">{breakdownOtherLabel}</span>
                            <span className="font-semibold uppercase tracking-wide text-muted">Seats</span>
                            <span className="font-semibold uppercase tracking-wide text-muted">% of {r.name}&apos;s seats</span>
                            {breakdown.map((b) => (
                              <Fragment key={`${b.university}-${b.country}`}>
                                <span className="text-ink">{b[otherField]}</span>
                                <span className="text-ink">{b.seat_count}</span>
                                <span className={cn("text-ink", b[pctField] >= 25 && "font-semibold text-primary")}>{b[pctField]}%</span>
                              </Fragment>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-[12.5px] text-muted">
                No matches.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
