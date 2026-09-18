"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";
import {
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  navItemsByGroup,
  type NavGroup,
} from "@/lib/nav-items";

type ToolGroup = Exclude<NavGroup, "overview">;
type FilterKey = "all" | ToolGroup;

const DESCRIPTIONS: Record<string, string> = {
  "/application-readiness": "Plan the route, documents, fallback path, forms, and final checks in one workspace.",
  "/requirement-checker": "Check university-specific requirements against KMate's source-tagged official dataset.",
  "/gks": "Ask GKS questions against official guideline evidence instead of community guesswork.",
  "/official-guidelines": "Open the current guideline, source notices, archives, and the 2027 quick guide.",
  "/apostille": "See authentication timing, document rules, and verified country-specific exceptions.",
  "/notices": "Track current Study in Korea and reviewed GKS notices with program and track filters.",
  "/scholarships": "Browse university scholarships with benefits, deadlines, requirements, and source links.",
  "/interview-db": "Draft answers, filter question themes, and launch KMate's AI mock-interview workflow.",
  "/mistakes": "Search recurring application mistakes and rejection-risk patterns reported by applicants.",
  "/eca": "Browse extracurricular examples by track, activity type, impact area, and confidence.",
  "/faq-trends": "See the questions applicants ask most often and open them in GKS Assistant.",
  "/messages": "Use KMate's private 1:1 messaging workspace for accepted connections.",
  "/requests": "Discover applicants, handle requests, and manage your connections.",
  "/scholar-stats": "Explore final-round scholar placements and compare universities side by side.",
};

const BADGES: Record<string, string> = {
  "/application-readiness": "Planner",
  "/requirement-checker": "Official data",
  "/gks": "AI + sources",
  "/official-guidelines": "Official",
  "/apostille": "Official",
  "/notices": "Live feed",
  "/scholarships": "University data",
  "/interview-db": "Practice",
  "/mistakes": "Community",
  "/eca": "Community",
  "/faq-trends": "Trends",
  "/messages": "Private",
  "/requests": "Community",
  "/scholar-stats": "NIIED data",
};

const GROUP_SUBTITLES: Record<ToolGroup, string> = {
  application: "Build and verify the application itself.",
  resources: "Rules, sources, notices, and funding.",
  preparation: "Prepare the parts that need judgment and practice.",
  community: "People, conversations, and placement context.",
};

const GROUP_TONES: Record<
  ToolGroup,
  {
    label: string;
    icon: string;
    rail: string;
    dot: string;
    selectedFilter: string;
  }
> = {
  application: {
    label: "text-primary",
    icon: "bg-primary-soft text-primary",
    rail: "bg-primary",
    dot: "bg-primary",
    selectedFilter: "border-primary bg-primary text-white",
  },
  resources: {
    label: "text-gold",
    icon: "bg-gold-soft text-gold",
    rail: "bg-gold",
    dot: "bg-gold",
    selectedFilter: "border-primary bg-primary text-white",
  },
  preparation: {
    label: "text-gks-u",
    icon: "bg-gks-u/10 text-gks-u",
    rail: "bg-gks-u",
    dot: "bg-gks-u",
    selectedFilter: "border-primary bg-primary text-white",
  },
  community: {
    label: "text-gks-g",
    icon: "bg-gks-g/10 text-gks-g",
    rail: "bg-gks-g",
    dot: "bg-gks-g",
    selectedFilter: "border-primary bg-primary text-white",
  },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All tools" },
  { key: "application", label: "Application" },
  { key: "resources", label: "Resources" },
  { key: "preparation", label: "Preparation" },
  { key: "community", label: "Community" },
];

export function ToolDirectory() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }

      if (event.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const groups = useMemo(() => {
    return (NAV_GROUP_ORDER.filter((group): group is ToolGroup => group !== "overview"))
      .map((group) => {
        const items = navItemsByGroup(group).filter((item) => {
          if (filter !== "all" && group !== filter) return false;
          if (!normalizedQuery) return true;

          return [
            item.label,
            DESCRIPTIONS[item.href] ?? "",
            BADGES[item.href] ?? "",
            NAV_GROUP_LABELS[group],
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);
        });

        return { group, items };
      })
      .filter(({ items }) => items.length > 0);
  }, [filter, normalizedQuery]);

  const visibleCount = groups.reduce((total, group) => total + group.items.length, 0);

  return (
    <section className="mt-5 rounded-[16px] border border-border bg-white p-4 shadow-card sm:p-5 lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-primary">Tool explorer</p>
          </div>
          <h2 className="mt-2 text-[21px] font-bold tracking-[-0.03em] text-ink sm:text-[25px]">
            Jump straight to the work.
          </h2>
          <p className="mt-1.5 max-w-2xl text-[11.5px] font-medium leading-5 text-muted">
            Search the full KMate workspace or narrow it by task.
          </p>
        </div>

        <div className="relative w-full lg:w-[330px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/65" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tools…"
            aria-label="Search KMate tools"
            aria-keyshortcuts="/"
            className="h-11 w-full rounded-[11px] border border-border bg-canvas/70 pl-10 pr-16 text-[12px] font-semibold text-ink outline-none placeholder:text-muted/50 focus:border-primary focus:bg-white"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              aria-label="Clear tool search"
              className="pressable absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-muted hover:bg-primary-soft hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-[6px] border border-border bg-white px-1.5 py-0.5 text-[9px] font-extrabold text-muted/55">
              /
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-4">
        {FILTERS.map((item) => {
          const selected = filter === item.key;
          const tone = item.key === "all" ? null : GROUP_TONES[item.key];

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              aria-pressed={selected}
              className={[
                "pressable inline-flex h-8 items-center gap-2 rounded-[9px] border px-3 text-[10px] font-extrabold",
                selected
                  ? item.key === "all"
                    ? "border-primary bg-primary text-white"
                    : tone?.selectedFilter
                  : "border-transparent bg-transparent text-muted hover:border-border hover:bg-canvas hover:text-ink",
              ].join(" ")}
            >
              {tone && <span className={["h-1.5 w-1.5 rounded-full", tone.dot].join(" ")} />}
              {item.label}
            </button>
          );
        })}

        <span className="ml-auto text-[9.5px] font-bold text-muted/60">
          {visibleCount} {visibleCount === 1 ? "tool" : "tools"}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="mt-5 rounded-[14px] border border-dashed border-border bg-canvas/50 px-5 py-10 text-center">
          <p className="text-[12px] font-extrabold text-ink">No KMate tool matches “{query}”.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("all");
              searchRef.current?.focus();
            }}
            className="pressable mt-3 rounded-[9px] bg-primary-soft px-3 py-2 text-[10.5px] font-extrabold text-primary hover:bg-primary/15"
          >
            Reset explorer
          </button>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {groups.map(({ group, items }) => {
            const tone = GROUP_TONES[group];

            return (
              <section key={group} className="relative overflow-hidden rounded-[12px] border border-border bg-canvas/35 p-3 sm:p-4">
                <span className={["absolute inset-y-0 left-0 w-[3px]", tone.rail].join(" ")} />
                <div className="px-1 pb-3">
                  <p className={["text-[9.5px] font-extrabold uppercase tracking-[0.15em]", tone.label].join(" ")}>
                    {NAV_GROUP_LABELS[group]}
                  </p>
                  <p className="mt-1 text-[10.5px] font-medium text-muted">{GROUP_SUBTITLES[group]}</p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((item) => {
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="interactive-card pressable group flex min-h-[118px] flex-col rounded-[10px] border border-border bg-white px-4 py-3.5 shadow-xs hover:-translate-y-[1px] hover:border-primary/20 hover:shadow-card-hover"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className={["flex h-8 w-8 items-center justify-center rounded-[9px]", tone.icon].join(" ")}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5 text-muted/35 transition-transform duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                        </div>

                        <div className="mt-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[12px] font-extrabold tracking-[-0.01em] text-ink">{item.label}</p>
                            <span className="rounded-[6px] bg-canvas px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.08em] text-muted/60">
                              {BADGES[item.href] ?? "Tool"}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[9.75px] font-medium leading-4 text-muted">
                            {DESCRIPTIONS[item.href]}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
