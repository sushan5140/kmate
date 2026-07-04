"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useDebouncedCallback } from "@/lib/hooks/use-debounced-callback";
import { TRACK_LABELS, type Track } from "@/lib/constants";
import { MAJORS } from "@/data/majors";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface UniversityOption {
  id: string;
  name: string;
}

export function DiscoverFilters({ ownTrack }: { ownTrack: Track }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [majorQuery, setMajorQuery] = useState(searchParams.get("major") ?? "");
  const [uniQuery, setUniQuery] = useState(searchParams.get("universityName") ?? "");
  const [uniResults, setUniResults] = useState<UniversityOption[]>([]);
  const [uniOpen, setUniOpen] = useState(false);

  const activeTracks = searchParams.getAll("track");
  const effectiveTracks = activeTracks.length ? activeTracks : [ownTrack];

  const { debounced: searchUniversities } = useDebouncedCallback(async (q: string) => {
    if (!q) {
      setUniResults([]);
      return;
    }
    const res = await fetch(`/api/universities/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setUniResults((data.universities ?? []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
  }, 250);

  useEffect(() => {
    searchUniversities(uniQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniQuery]);

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(`/discover?${params.toString()}`);
  }

  function toggleTrack(track: Track) {
    pushParams((params) => {
      const current = new Set(params.getAll("track").length ? params.getAll("track") : [ownTrack]);
      if (current.has(track)) current.delete(track);
      else current.add(track);
      params.delete("track");
      // Never let both be removed -- always fall back to at least own track.
      const next = current.size ? current : new Set([ownTrack]);
      next.forEach((t) => params.append("track", t));
    });
  }

  function setMajor(major: string) {
    setMajorQuery(major);
    pushParams((params) => {
      if (major) params.set("major", major);
      else params.delete("major");
    });
  }

  function setYear(year: string) {
    pushParams((params) => {
      if (year) params.set("year", year);
      else params.delete("year");
    });
  }

  function selectUniversity(uni: UniversityOption) {
    setUniQuery(uni.name);
    setUniOpen(false);
    pushParams((params) => {
      params.set("university", uni.id);
      params.set("universityName", uni.name);
    });
  }

  function clearUniversity() {
    setUniQuery("");
    pushParams((params) => {
      params.delete("university");
      params.delete("universityName");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1.5">
        {(Object.keys(TRACK_LABELS) as Track[]).map((track) => (
          <button
            key={track}
            type="button"
            onClick={() => toggleTrack(track)}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${
              effectiveTracks.includes(track)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-white text-muted"
            }`}
          >
            {TRACK_LABELS[track]}
          </button>
        ))}
      </div>

      <SearchableSelect
        options={MAJORS}
        value={majorQuery}
        onChange={setMajor}
        placeholder="Filter by major"
        className="w-48"
      />

      <div className="relative w-56">
        <input
          type="text"
          value={uniQuery}
          onChange={(e) => {
            setUniQuery(e.target.value);
            setUniOpen(true);
            if (!e.target.value) clearUniversity();
          }}
          onFocus={() => setUniOpen(true)}
          onBlur={() => setTimeout(() => setUniOpen(false), 120)}
          placeholder="Filter by university"
          className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[14px] text-ink outline-none focus:border-primary"
        />
        {uniOpen && uniResults.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-white shadow-card">
            {uniResults.map((uni) => (
              <li key={uni.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectUniversity(uni)}
                  className="block w-full px-3 py-2 text-left text-[14px] text-ink hover:bg-canvas"
                >
                  {uni.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <select
        defaultValue={searchParams.get("year") ?? ""}
        onChange={(e) => setYear(e.target.value)}
        className="h-10 rounded-lg border border-border bg-white px-3 text-[14px] text-ink"
      >
        <option value="">Any year</option>
        {[0, 1, 2].map((offset) => {
          const year = new Date().getFullYear() + offset;
          return (
            <option key={year} value={year}>
              {year}
            </option>
          );
        })}
      </select>
    </div>
  );
}
