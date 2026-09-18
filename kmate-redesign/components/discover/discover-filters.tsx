"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { TRACK_LABELS, type Track } from "@/lib/constants";
import { MAJORS } from "@/data/majors";
import { SearchableSelect, type SearchableRemoteOption } from "@/components/ui/searchable-select";

interface UniversityOption {
  id: string;
  name: string;
}

export function DiscoverFilters({ ownTrack }: { ownTrack: Track }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [majorQuery, setMajorQuery] = useState(searchParams.get("major") ?? "");
  const [uniQuery, setUniQuery] = useState(searchParams.get("universityName") ?? "");

  const activeTracks = searchParams.getAll("track");
  const effectiveTracks = activeTracks.length ? activeTracks : [ownTrack];

  // Same seeded universities table the onboarding/profile university picker
  // already searches -- no separate/hardcoded list. Scoped to the currently
  // active track so, e.g., a GKS-U Discover view doesn't suggest GKS-G-only
  // universities (the API already supported this `track` param; the old
  // hand-rolled version here just never passed it).
  async function loadUniversities(q: string): Promise<SearchableRemoteOption[]> {
    const params = new URLSearchParams({ q });
    if (effectiveTracks[0]) params.set("track", effectiveTracks[0]);
    const res = await fetch(`/api/universities/search?${params.toString()}`);
    const data = await res.json();
    return (data.universities ?? []).map((u: { id: string; name: string }) => ({ id: u.id, label: u.name }));
  }

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    // Discover now lives as a tab on /requests rather than its own page --
    // keep tab=discover on every filter change or a mutation would bounce
    // back to whichever tab is the default.
    params.set("tab", "discover");
    router.push(`/requests?${params.toString()}`);
  }

  // Exclusive selection -- clicking a track pill always replaces the current
  // filter with just that track, never unions with whatever was selected
  // before (a prior union-based toggle here meant one click on GKS-G still
  // included GKS-U, since the implicit own-track default got merged in
  // instead of replaced).
  function selectTrack(track: Track) {
    pushParams((params) => {
      params.delete("track");
      params.append("track", track);
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
            onClick={() => selectTrack(track)}
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

      <SearchableSelect
        loadOptions={loadUniversities}
        value={uniQuery}
        onChange={(v) => {
          setUniQuery(v);
          if (!v) clearUniversity();
        }}
        onSelect={(opt) => selectUniversity({ id: opt.id, name: opt.label })}
        placeholder="Filter by university"
        className="w-56"
      />

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
