"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { EMBASSY_TYPE_LABELS, type EmbassyType } from "@/lib/constants";

export interface UniversityOption {
  name: string;
  embassyType: EmbassyType | null;
}

/**
 * Type A / Type B is context only -- it never changes what the comparison
 * counts. Deliberately low-contrast so the university name stays the loudest
 * thing in the row, and the type is spelled out as words rather than carried
 * by the tint alone.
 */
export function EmbassyTypeBadge({ embassyType, className }: { embassyType: EmbassyType; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        embassyType === "type_a" ? "bg-primary-soft text-primary" : "bg-gold-soft text-gold",
        className
      )}
    >
      {EMBASSY_TYPE_LABELS[embassyType]}
    </span>
  );
}

/**
 * Searchable university selector for the Scholar Stats comparison, modelled on
 * components/ui/searchable-select.tsx (same input/dropdown shell) with three
 * additions that component intentionally doesn't carry, so that its existing
 * onboarding and Discover callers are left untouched:
 *
 *   - a secondary Type A/B badge per option,
 *   - full arrow-key/Enter/Escape listbox navigation,
 *   - the whole list on focus with no query typed.
 *
 * Filtering is client-side over the array Scholar Stats already ships to the
 * browser (74 universities at most) -- no request is made per keystroke.
 */
export function UniversityPicker({
  label,
  options,
  value,
  onChange,
  placeholder = "Search universities…",
}: {
  label: string;
  options: readonly UniversityOption[];
  value: UniversityOption | null;
  onChange: (option: UniversityOption | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.name.toLowerCase().includes(q));
  }, [options, query]);

  // Clamped rather than stored, so a shrinking result list can never leave the
  // highlight pointing past the end (which would make Enter a no-op).
  const safeActive = matches.length === 0 ? -1 : Math.min(activeIndex, matches.length - 1);

  useEffect(() => {
    if (!open || safeActive < 0) return;
    listRef.current?.querySelectorAll("li")[safeActive]?.scrollIntoView({ block: "nearest" });
  }, [open, safeActive]);

  function commit(option: UniversityOption) {
    onChange(option);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (matches.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        const from = Math.min(current, matches.length - 1);
        return (from + step + matches.length) % matches.length;
      });
      return;
    }
    if (event.key === "Enter") {
      if (open && safeActive >= 0) {
        event.preventDefault();
        commit(matches[safeActive]);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        // Closes only when focus actually leaves the widget, so clicking an
        // option (or tabbing through it) doesn't dismiss the list first.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted" htmlFor={`${listId}-input`}>
        {label}
      </label>

      {value ? (
        <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3">
          <span className="truncate text-[14px] font-medium text-ink" title={value.name}>
            {value.name}
          </span>
          {value.embassyType && <EmbassyTypeBadge embassyType={value.embassyType} />}
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
              setOpen(true);
            }}
            aria-label={`Change ${label.toLowerCase()} (currently ${value.name})`}
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-canvas hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted" />
          <input
            id={`${listId}-input`}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && safeActive >= 0 ? `${listId}-option-${safeActive}` : undefined}
            value={query}
            placeholder={placeholder}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-9 text-[14px] text-ink outline-none focus:border-primary"
          />
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        </div>
      )}

      {open && !value && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-white py-1 shadow-card"
        >
          {matches.map((option, index) => (
            <li key={option.name} id={`${listId}-option-${index}`} role="option" aria-selected={index === safeActive}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(option)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left",
                  index === safeActive && "bg-canvas"
                )}
              >
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{option.name}</span>
                {option.embassyType && <EmbassyTypeBadge embassyType={option.embassyType} />}
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-muted">No university matches “{query.trim()}”.</li>
          )}
        </ul>
      )}
    </div>
  );
}
