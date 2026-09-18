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

const GROUP_TONES: Record<ToolGroup, { dot: string; icon: string }> = {
  application: { dot: "bg-primary", icon: "text-primary" },
  resources: { dot: "bg-gold", icon: "text-gold" },
  preparation: { dot: "bg-gks-u", icon: "text-gks-u" },
  community: { dot: "bg-gks-g", icon: "text-gks-g" },
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
    <section className="mt-8 border-t-2 border-ink pt-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-end">
        <div>
          <p className="text-[12px] font-semibold text-primary">KMate index</p>
          <h2 className="mt-1 text-[24px] font-extrabold tracking-[-0.035em] text-ink sm:text-[28px]">
            Find the exact tool you need.
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] font-medium leading-5 text-muted">
            Search the workspace or narrow it to one part of the application.
          </p>
        </div>

        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search KMate"
            aria-label="Search KMate tools"
            aria-keyshortcuts="/"
            className="h-11 w-full rounded-[9px] border border-border bg-white pl-10 pr-16 text-[13px] font-semibold text-ink outline-none placeholder:text-muted/55 focus:border-primary"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              aria-label="Clear tool search"
              className="pressable absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-[8px] text-muted hover:bg-primary-soft hover:text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-[5px] border border-border bg-canvas px-1.5 py-0.5 text-[10px] font-bold text-muted">
              /
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 flex max-w-full items-center gap-5 overflow-x-auto border-b border-border">
        {FILTERS.map((item) => {
          const selected = filter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              aria-pressed={selected}
              className={[
                "pressable min-h-11 shrink-0 border-b-2 px-0.5 text-[12px] font-semibold",
                selected
                  ? "border-primary text-ink"
                  : "border-transparent text-muted hover:text-ink",
              ].join(" ")}
            >
              {item.label}
            </button>
          );
        })}
        <span className="ml-auto shrink-0 pb-3 text-[11px] font-semibold text-muted">
          {visibleCount} {visibleCount === 1 ? "tool" : "tools"}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="border-b border-border px-2 py-12 text-center">
          <p className="text-[13px] font-bold text-ink">No KMate tool matches “{query}”.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("all");
              searchRef.current?.focus();
            }}
            className="pressable mt-3 min-h-11 rounded-[9px] border border-border bg-white px-4 text-[12px] font-bold text-primary hover:border-primary/25 hover:bg-primary-soft"
          >
            Reset search
          </button>
        </div>
      ) : (
        <div className="grid gap-x-10 xl:grid-cols-2">
          {groups.map(({ group, items }) => {
            const tone = GROUP_TONES[group];
            return (
              <section key={group} className="border-b border-border py-5">
                <div className="flex items-start gap-2.5">
                  <span className={["mt-1.5 h-2 w-2 shrink-0 rounded-full", tone.dot].join(" ")} />
                  <div>
                    <h3 className="text-[14px] font-extrabold text-ink">{NAV_GROUP_LABELS[group]}</h3>
                    <p className="mt-0.5 text-[12px] font-medium text-muted">{GROUP_SUBTITLES[group]}</p>
                  </div>
                </div>

                <div className="mt-3 divide-y divide-border">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="pressable group grid min-h-[76px] grid-cols-[36px_1fr_auto] items-center gap-3 py-3 text-left"
                      >
                        <span className={["flex h-9 w-9 items-center justify-center rounded-[8px] border border-border bg-white", tone.icon].join(" ")}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[13px] font-extrabold text-ink">{item.label}</span>
                            <span className="text-[10px] font-semibold text-muted">{BADGES[item.href] ?? "Tool"}</span>
                          </span>
                          <span className="mt-1 block text-[12px] font-medium leading-5 text-muted">
                            {DESCRIPTIONS[item.href]}
                          </span>
                        </span>
                        <ArrowUpRight className="h-4 w-4 text-muted/45 transition-[color,transform] duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
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
