"use client";

import { useEffect, useState } from "react";
import { Reorder } from "framer-motion";
import { X, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { useDebouncedCallback } from "@/lib/hooks/use-debounced-callback";
import {
  describeUniversityQuota,
  maxUniversityChoices,
  validateUniversityChoices,
} from "@/lib/validation/university-eligibility";
import type { GksUApplicationRoute, GksUEmbassyPath, Track } from "@/lib/constants";

interface EligibilityRow {
  id: string;
  track: string;
  category: string;
  embassy_type: "type_a" | "type_b" | null;
  specialization: string | null;
}

interface UniversitySearchResult {
  id: string;
  name: string;
  city: string | null;
  eligibility: EligibilityRow[];
}

export interface SelectedUniversity {
  universityId: string;
  name: string;
  eligibilityId: string | null;
  embassyType: "type_a" | "type_b" | null;
  category: string | null;
}

interface UniversityPickerProps {
  track: Track;
  gksUEmbassyPath: GksUEmbassyPath | null;
  gksUApplicationRoute?: GksUApplicationRoute | null;
  selected: SelectedUniversity[];
  onChange: (selected: SelectedUniversity[]) => void;
}

function pickEligibility(
  eligibility: EligibilityRow[],
  track: Track,
  route: GksUApplicationRoute | null,
  embassyPath: GksUEmbassyPath | null
): EligibilityRow | undefined {
  if (track === "gks_g") {
    return eligibility.find((row) => row.category === "type_a" || row.category === "type_b");
  }

  if (route === "university") {
    return (
      eligibility.find((row) => row.category === "uic_bachelors") ??
      eligibility.find((row) => row.category === "associate_degree")
    );
  }

  if (route === "embassy" && embassyPath === "r_gks") {
    return eligibility.find((row) => row.category === "embassy_type_b_rgks");
  }

  if (route === "embassy") {
    return eligibility.find((row) => row.category.startsWith("embassy_"));
  }

  return undefined;
}

export function UniversityPicker({
  track,
  gksUEmbassyPath,
  gksUApplicationRoute = null,
  selected,
  onChange,
}: UniversityPickerProps) {
  const [query, setQuery] = useState("");
  const maxChoices = maxUniversityChoices(track, gksUEmbassyPath, gksUApplicationRoute);
  const [results, setResults] = useState<UniversitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const { debounced: search } = useDebouncedCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/universities/search?track=${track}&q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      setResults(data.universities ?? []);
    } finally {
      setLoading(false);
    }
  }, 250);

  useEffect(() => {
    search(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, track]);

  function addUniversity(uni: UniversitySearchResult) {
    if (selected.length >= maxChoices) return;
    if (selected.some((s) => s.universityId === uni.id)) return;
    const eligibility = pickEligibility(uni.eligibility, track, gksUApplicationRoute, gksUEmbassyPath);
    if (!eligibility) return;
    onChange([
      ...selected,
      {
        universityId: uni.id,
        name: uni.name,
        eligibilityId: eligibility?.id ?? null,
        embassyType: eligibility?.embassy_type ?? null,
        category: eligibility?.category ?? null,
      },
    ]);
  }

  function removeUniversity(universityId: string) {
    onChange(selected.filter((s) => s.universityId !== universityId));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  const validation = validateUniversityChoices(
    track,
    gksUEmbassyPath,
    selected.map((s) => ({ category: s.category ?? "", embassyType: s.embassyType })),
    gksUApplicationRoute
  );

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search universities…"
        className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[14px] text-ink outline-none focus:border-primary"
      />

      {query && (
        <ul className="mt-2 max-h-48 overflow-auto rounded-lg border border-border bg-white shadow-card">
          {loading && <li className="px-3 py-2 text-[13px] text-muted">Searching…</li>}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-muted">No matches.</li>
          )}
          {!loading &&
            results.map((uni) => (
              <li key={uni.id}>
                <button
                  type="button"
                  onClick={() => addUniversity(uni)}
                  disabled={selected.some((s) => s.universityId === uni.id) || selected.length >= maxChoices}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-[14px] text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>{uni.name}</span>
                  {selected.some((s) => s.universityId === uni.id) && (
                    <span className="text-[12px] text-muted">Added</span>
                  )}
                </button>
              </li>
            ))}
        </ul>
      )}

      {selected.length > 0 && (
        <Reorder.Group
          axis="y"
          values={selected}
          onReorder={onChange}
          className="mt-4 flex flex-col gap-2"
        >
          {selected.map((s, i) => (
            <Reorder.Item
              key={s.universityId}
              value={s}
              className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2"
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted" aria-hidden />
              <span className="text-[12px] font-medium text-muted">#{i + 1}</span>
              <span className="flex-1 text-[14px] text-ink">{s.name}</span>
              {s.embassyType && (
                <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                  {s.embassyType === "type_a" ? "Type A" : "Type B"}
                </span>
              )}
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={`Move ${s.name} up`}
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === selected.length - 1}
                  className="text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={`Move ${s.name} down`}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeUniversity(s.universityId)}
                className="text-muted hover:text-ink"
                aria-label={`Remove ${s.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      <p className="mt-2 text-[12.5px] text-muted">
        Drag, or use the arrows, to reorder by priority.{" "}
        {describeUniversityQuota(track, gksUEmbassyPath, gksUApplicationRoute)}
      </p>
      {!validation.valid && (
        <p className="mt-1 text-[12.5px] text-red-600">{validation.message}</p>
      )}
    </div>
  );
}
