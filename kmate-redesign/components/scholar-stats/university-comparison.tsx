"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { TRACK_LABELS, type EmbassyType, type Track } from "@/lib/constants";
import type { CachedGksCrossTabRow, CachedGksUniversityStat } from "@/lib/cached-content";
import {
  deriveComparison,
  formatPct,
  toCountryShares,
  toUniversitySide,
  universitySlug,
  type CountryShare,
  type UniversitySide,
} from "@/lib/scholar-stats/comparison";
import { EmbassyTypeBadge, UniversityPicker, type UniversityOption } from "./university-picker";

type Breakdown = CountryShare[] | "error";

function cacheKey(track: Track, university: string) {
  return `${track}::${university}`;
}

/** Neutral phrasing -- these are historical records, never a rate or a chance. */
function leaderSentence(
  first: UniversitySide,
  second: UniversitySide,
  firstValue: number,
  secondValue: number,
  noun: string
) {
  if (firstValue === secondValue) return `Both have ${firstValue} ${noun}.`;
  const [ahead, aheadValue, behindValue] =
    firstValue > secondValue ? [first, firstValue, secondValue] : [second, secondValue, firstValue];
  return `${ahead.name} has more ${noun} (${aheadValue} vs ${behindValue}).`;
}

function MetricRow({ label, first, second }: { label: string; first: React.ReactNode; second: React.ReactNode }) {
  return (
    <>
      <div className="border-t border-hairline px-3 py-2 text-[12.5px] text-muted">{label}</div>
      <div className="border-t border-hairline px-3 py-2 text-[12.5px] font-medium text-ink">{first}</div>
      <div className="border-t border-hairline px-3 py-2 text-[12.5px] font-medium text-ink">{second}</div>
    </>
  );
}

function CountryList({ side, breakdown }: { side: UniversitySide; breakdown: Breakdown | undefined }) {
  return (
    <div className="rounded-lg bg-surface ring-1 ring-hairline">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2">
        <span className="text-[13px] font-semibold text-ink">{side.name}</span>
        {side.embassyType && <EmbassyTypeBadge embassyType={side.embassyType} />}
      </div>

      {side.degreeLevels.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-hairline px-3 py-2 text-[12px] text-muted">
          {side.degreeLevels.map((level) => (
            <span key={level.label}>
              {level.label}: <span className="font-medium text-ink">{level.count}</span>
            </span>
          ))}
        </div>
      )}

      {breakdown === undefined && <p className="px-3 py-3 text-[12px] text-muted">Loading country distribution…</p>}
      {breakdown === "error" && (
        <p className="px-3 py-3 text-[12px] text-danger">Couldn&apos;t load this country distribution. Try again.</p>
      )}
      {Array.isArray(breakdown) && breakdown.length === 0 && (
        <p className="px-3 py-3 text-[12px] text-muted">No recorded scholars for this university in this view.</p>
      )}
      {Array.isArray(breakdown) && breakdown.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-hairline">
                <th className="px-3 py-2 font-semibold text-ink">Country</th>
                <th className="px-3 py-2 text-right font-semibold text-ink">Recorded scholars</th>
                <th className="px-3 py-2 text-right font-semibold text-ink">% of records</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row) => (
                <tr key={row.country} className="border-b border-hairline last:border-0">
                  <td className="px-3 py-1.5 text-ink">{row.country}</td>
                  <td className="px-3 py-1.5 text-right text-ink">{row.scholars}</td>
                  <td
                    className={cn(
                      "px-3 py-1.5 text-right text-ink",
                      row.pct !== null && row.pct >= 25 && "font-semibold text-primary"
                    )}
                  >
                    {formatPct(row.pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CountrySet({ label, countries }: { label: string; countries: string[] }) {
  return (
    <p className="text-[12.5px] leading-relaxed text-muted">
      <span className="font-medium text-ink">{label}:</span> {countries.length > 0 ? countries.join(", ") : "none"}
    </p>
  );
}

export function UniversityComparison({
  track,
  universities,
  embassyTypes,
  initialFirst,
  initialSecond,
  onClose,
}: {
  track: Track;
  universities: readonly CachedGksUniversityStat[];
  embassyTypes: Record<string, EmbassyType>;
  /** From ?compare=, already resolved to a stats university name on the server. */
  initialFirst: string | null;
  initialSecond: string | null;
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState<string | null>(initialFirst);
  const [secondName, setSecondName] = useState<string | null>(initialSecond);
  const [breakdowns, setBreakdowns] = useState<Record<string, Breakdown>>({});
  const inFlight = useRef(new Set<string>());

  const statByName = useMemo(() => new Map(universities.map((u) => [u.university, u])), [universities]);

  const options: UniversityOption[] = useMemo(
    () =>
      universities
        .map((u) => ({ name: u.university, embassyType: embassyTypes[u.university] ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [universities, embassyTypes]
  );

  // Mirror the selection into the URL so a comparison can be linked. The URL is
  // written but never read back here -- the inbound ?compare= is resolved on the
  // server and arrives as initialFirst/initialSecond -- so a shared link renders
  // on first paint and this replaceState can never fight the pickers.
  // replaceState rather than router.replace(): this is presentational state, and
  // a Next navigation would re-render the whole route on every pick.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (firstName || secondName) {
      params.set("compare", [firstName, secondName].map((n) => (n ? universitySlug(n) : "")).join(","));
    } else {
      params.delete("compare");
    }
    // toString() percent-encodes the separator, which would leave shared links
    // reading ?compare=a%2Cb. A comma is a legal sub-delimiter in a query value
    // and Next decodes it either way, so put the readable one back.
    const query = params.toString().replace(/%2C/g, ",");
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, [firstName, secondName]);

  const fetchBreakdown = useCallback(
    (university: string) => {
      const key = cacheKey(track, university);
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      const total = statByName.get(university)?.total_selected_count ?? 0;
      void (async () => {
        try {
          const res = await fetch(
            `/api/scholar-stats/breakdown?university=${encodeURIComponent(university)}&track=${track}`
          );
          if (!res.ok) throw new Error("fetch failed");
          const data = (await res.json()) as { rows: CachedGksCrossTabRow[] };
          setBreakdowns((prev) => ({ ...prev, [key]: toCountryShares(data.rows, total) }));
        } catch {
          setBreakdowns((prev) => ({ ...prev, [key]: "error" }));
        } finally {
          inFlight.current.delete(key);
        }
      })();
    },
    [track, statByName]
  );

  // Both sides always resolve against the same `track`, so the two columns can
  // never end up showing two different filter contexts.
  useEffect(() => {
    for (const name of [firstName, secondName]) {
      if (!name || !statByName.has(name)) continue;
      if (breakdowns[cacheKey(track, name)] !== undefined) continue;
      fetchBreakdown(name);
    }
  }, [firstName, secondName, track, breakdowns, statByName, fetchBreakdown]);

  const firstStat = firstName ? statByName.get(firstName) : undefined;
  const secondStat = secondName ? statByName.get(secondName) : undefined;
  const isSameUniversity = Boolean(firstName && secondName && firstName === secondName);

  // A university picked under one track may be absent from the other's records.
  // Resolving through statByName (rather than trusting the stored name) means
  // the dual-track toggle degrades to the "pick one more" prompt instead of
  // rendering a half-empty comparison.
  const first = firstStat ? toUniversitySide(firstStat, embassyTypes[firstStat.university] ?? null) : null;
  const second = secondStat ? toUniversitySide(secondStat, embassyTypes[secondStat.university] ?? null) : null;

  const firstBreakdown = firstName ? breakdowns[cacheKey(track, firstName)] : undefined;
  const secondBreakdown = secondName ? breakdowns[cacheKey(track, secondName)] : undefined;

  const delta = useMemo(() => {
    if (!first || !second || isSameUniversity) return null;
    if (!Array.isArray(firstBreakdown) || !Array.isArray(secondBreakdown)) return null;
    return deriveComparison(first, second, firstBreakdown, secondBreakdown);
  }, [first, second, isSameUniversity, firstBreakdown, secondBreakdown]);

  const selectedValue = (name: string | null): UniversityOption | null =>
    name ? { name, embassyType: embassyTypes[name] ?? null } : null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-canvas p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[14.5px] font-semibold text-ink">Compare universities</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            Both sides are counted from the same {TRACK_LABELS[track]} 2026 Final Round records.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-medium text-muted hover:bg-surface hover:text-ink"
        >
          <X className="h-3.5 w-3.5" /> Close
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end">
        <UniversityPicker
          label="First university"
          options={options}
          value={selectedValue(firstName)}
          onChange={(option) => setFirstName(option?.name ?? null)}
        />
        <button
          type="button"
          onClick={() => {
            setFirstName(secondName);
            setSecondName(firstName);
          }}
          disabled={!firstName && !secondName}
          aria-label="Swap the two universities"
          className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[12.5px] font-medium text-muted hover:text-ink disabled:opacity-40 md:w-10 md:px-0"
        >
          <ArrowLeftRight className="h-4 w-4" />
          <span className="md:hidden">Swap</span>
        </button>
        <UniversityPicker
          label="Second university"
          options={options}
          value={selectedValue(secondName)}
          onChange={(option) => setSecondName(option?.name ?? null)}
        />
      </div>

      {(firstName || secondName) && (
        <button
          type="button"
          onClick={() => {
            setFirstName(null);
            setSecondName(null);
          }}
          className="mt-2 text-[12.5px] font-medium text-muted underline underline-offset-2 hover:text-ink"
        >
          Clear comparison
        </button>
      )}

      {isSameUniversity && (
        <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-[12.5px] text-muted ring-1 ring-hairline">
          That&apos;s the same university on both sides. Pick a different one to compare.
        </p>
      )}

      {!isSameUniversity && !(first && second) && (
        <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-[12.5px] text-muted ring-1 ring-hairline">
          {!first && !second
            ? "Pick two universities to compare their recorded scholars side by side."
            : "Pick one more university to see the comparison."}
        </p>
      )}

      {first && second && !isSameUniversity && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[15px] font-semibold text-ink">{first.name}</span>
            {first.embassyType && <EmbassyTypeBadge embassyType={first.embassyType} />}
            <span className="text-[12.5px] font-medium uppercase tracking-wide text-muted">vs</span>
            <span className="text-[15px] font-semibold text-ink">{second.name}</span>
            {second.embassyType && <EmbassyTypeBadge embassyType={second.embassyType} />}
          </div>

          <div className="mt-3 overflow-hidden rounded-lg bg-surface ring-1 ring-hairline">
            <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Metric</div>
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{first.name}</div>
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{second.name}</div>

              <MetricRow label="Recorded scholars" first={first.totalScholars} second={second.totalScholars} />
              <MetricRow
                label="Countries represented"
                first={first.countriesRepresented}
                second={second.countriesRepresented}
              />
              <MetricRow
                label="Embassy / university track"
                first={`${first.embassyTrackCount} / ${first.universityTrackCount}`}
                second={`${second.embassyTrackCount} / ${second.universityTrackCount}`}
              />
              {(delta?.degreeLabels ?? []).map((label) => (
                <MetricRow
                  key={label}
                  label={label}
                  first={first.degreeLevels.find((d) => d.label === label)?.count ?? 0}
                  second={second.degreeLevels.find((d) => d.label === label)?.count ?? 0}
                />
              ))}
              <MetricRow
                label="University type"
                first={first.embassyType ? <EmbassyTypeBadge embassyType={first.embassyType} /> : "Not listed"}
                second={second.embassyType ? <EmbassyTypeBadge embassyType={second.embassyType} /> : "Not listed"}
              />
            </div>
          </div>

          <div className="mt-2 space-y-1">
            <p className="text-[12.5px] text-muted">
              {leaderSentence(first, second, first.totalScholars, second.totalScholars, "recorded scholars")}
            </p>
            <p className="text-[12.5px] text-muted">
              {leaderSentence(
                first,
                second,
                first.countriesRepresented,
                second.countriesRepresented,
                "countries represented"
              )}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:gap-4">
            <div className="min-w-0 flex-1">
              <CountryList side={first} breakdown={firstBreakdown} />
            </div>
            <div className="flex items-center gap-2 md:hidden" aria-hidden>
              <span className="h-px flex-1 bg-hairline-strong" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">vs</span>
              <span className="h-px flex-1 bg-hairline-strong" />
            </div>
            <div className="min-w-0 flex-1">
              <CountryList side={second} breakdown={secondBreakdown} />
            </div>
          </div>

          {delta && (
            <div className="mt-3 space-y-1 rounded-lg bg-surface px-3 py-2.5 ring-1 ring-hairline">
              <CountrySet label="Countries in both" countries={delta.sharedCountries} />
              <CountrySet label={`Only in ${first.name}`} countries={delta.onlyFirstCountries} />
              <CountrySet label={`Only in ${second.name}`} countries={delta.onlySecondCountries} />
            </div>
          )}

          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            Historical KMate scholar data. These records do not represent an official acceptance rate or guarantee
            future selection.
          </p>
        </>
      )}
    </div>
  );
}
