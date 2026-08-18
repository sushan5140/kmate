"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useDebouncedCallback } from "@/lib/hooks/use-debounced-callback";

export interface SearchableRemoteOption {
  id: string;
  label: string;
}

interface SearchableSelectProps {
  /** Static, client-filtered list (e.g. majors). Ignored when `loadOptions` is provided. */
  options?: readonly string[];
  /**
   * Server-backed search, debounced and called as the user types -- for
   * lists too large to ship as a static array (e.g. universities). Mutually
   * exclusive with `options`; when both are given, this wins.
   */
  loadOptions?: (query: string) => Promise<SearchableRemoteOption[]>;
  value: string;
  onChange: (value: string) => void;
  /**
   * Only meaningful with `loadOptions`: fires with the full picked option
   * (id + label) when a suggestion is selected, since `onChange` alone only
   * ever carries the label -- callers that need the id (e.g. to store a
   * foreign key, not just the display name) use this instead.
   */
  onSelect?: (option: SearchableRemoteOption) => void;
  placeholder?: string;
  className?: string;
}

export function SearchableSelect({
  options,
  loadOptions,
  value,
  onChange,
  onSelect,
  placeholder = "Search…",
  className,
}: SearchableSelectProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [remoteResults, setRemoteResults] = useState<SearchableRemoteOption[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const { debounced: runRemoteSearch } = useDebouncedCallback(async (q: string) => {
    if (!loadOptions) return;
    if (!q) {
      setRemoteResults([]);
      return;
    }
    setRemoteResults(await loadOptions(q));
  }, 250);

  useEffect(() => {
    // No-op when loadOptions isn't provided -- preserves the original
    // sync-only component's behavior exactly (this effect did not exist
    // before `loadOptions` was added, and still does nothing without it).
    if (loadOptions) runRemoteSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const filtered: SearchableRemoteOption[] = useMemo(() => {
    if (loadOptions) return remoteResults;
    const q = query.trim().toLowerCase();
    const source = options ?? [];
    const matches = q ? source.filter((o) => o.toLowerCase().includes(q)) : source;
    // id === label for the plain-string case -- same identity used as the
    // original component's React key, so no rendering/key behavior changes.
    return matches.slice(0, 20).map((o) => ({ id: o, label: o }));
  }, [options, loadOptions, remoteResults, query]);

  function selectOption(option: SearchableRemoteOption) {
    setQuery(option.label);
    setOpen(false);
    onChange(option.label);
    onSelect?.(option);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[14px] text-ink outline-none focus:border-primary"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-white shadow-card">
          {filtered.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(option)}
                className="block w-full px-3 py-2 text-left text-[14px] text-ink hover:bg-canvas"
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
