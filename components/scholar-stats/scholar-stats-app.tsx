"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { ExpandableStatTable, type StatRow } from "./expandable-stat-table";
import type { GksTrack, CachedGksUniversityStat, CachedGksCountryStat } from "@/lib/cached-content";

export interface TrackData {
  universities: CachedGksUniversityStat[];
  countries: CachedGksCountryStat[];
}

const TRACK_LABELS: Record<GksTrack, string> = { gks_g: "GKS-G (Graduate)", gks_u: "GKS-U (Undergrad)" };

export function ScholarStatsApp({ gksG, gksU }: { gksG: TrackData; gksU: TrackData }) {
  const [track, setTrack] = useState<GksTrack>("gks_g");
  const [view, setView] = useState<"university" | "country">("university");
  const [search, setSearch] = useState("");

  const data = track === "gks_g" ? gksG : gksU;

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
      <div className="flex flex-wrap items-center gap-2">
        {(["gks_g", "gks_u"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTrack(t)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
              track === t
                ? t === "gks_g"
                  ? "border-gks-g bg-gks-g/10 text-gks-g"
                  : "border-gks-u bg-gks-u/10 text-gks-u"
                : "border-hairline-strong text-muted hover:text-ink"
            )}
          >
            {TRACK_LABELS[t]}
          </button>
        ))}
      </div>

      <Card className="mt-4">
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
          <ExpandableStatTable mode={view} track={track} rows={filteredRows} />
        </div>
      </Card>
    </div>
  );
}
