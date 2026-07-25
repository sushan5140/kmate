"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { ExpandableStatTable, type StatRow } from "./expandable-stat-table";
import type { CachedGksUniversityStat, CachedGksCountryStat } from "@/lib/cached-content";

export interface TrackData {
  universities: CachedGksUniversityStat[];
  countries: CachedGksCountryStat[];
}

export function ScholarStatsApp({ data }: { data: TrackData }) {
  const [view, setView] = useState<"university" | "country">("university");
  const [search, setSearch] = useState("");

  const universityRows: StatRow[] = useMemo(
    () =>
      data.universities.map((u) => ({
        name: u.university,
        total: u.total_selected_count,
        embassyCount: u.embassy_track_count,
        universityTrackCount: u.university_track_count,
        distinctOtherCount: u.distinct_country_count,
        degreeBreakdown: u.degree_level_breakdown,
      })),
    [data]
  );
  const countryRows: StatRow[] = useMemo(
    () =>
      data.countries.map((c) => ({
        name: c.country,
        total: c.total_selected_count,
        embassyCount: c.embassy_track_count,
        universityTrackCount: c.university_track_count,
        distinctOtherCount: c.distinct_university_count,
        degreeBreakdown: c.degree_level_breakdown,
      })),
    [data]
  );

  const rows = view === "university" ? universityRows : countryRows;
  const filteredRows = search.trim() ? rows.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase())) : rows;

  return (
    <div className="mt-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setView("university")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] font-medium",
                view === "university" ? "bg-primary-soft text-primary" : "text-muted hover:text-ink"
              )}
            >
              By university
            </button>
            <button
              type="button"
              onClick={() => setView("country")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] font-medium",
                view === "country" ? "bg-primary-soft text-primary" : "text-muted hover:text-ink"
              )}
            >
              By country
            </button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={view === "university" ? "Search universities…" : "Search countries…"}
              className="rounded-lg border border-hairline-strong bg-surface py-1.5 pl-8 pr-3 text-[13px] text-ink"
            />
          </div>
        </div>

        <p className="mt-2 text-[12px] text-muted">
          {view === "university"
            ? "Click a university to see which countries its scholars came from, and what share of that university's seats each country got."
            : "Click a country to see which universities its scholars went to, and what share of that country's total seats each university got."}
        </p>

        <div className="mt-3.5">
          <ExpandableStatTable mode={view} rows={filteredRows} />
        </div>
      </Card>
    </div>
  );
}
