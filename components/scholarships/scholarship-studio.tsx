"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  CircleDot,
  ExternalLink,
  GitCompareArrows,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

export interface ScholarshipStudioRow {
  id: string;
  university_name: string;
  scholarship_name: string;
  scholarship_type: string | null;
  degree_level: string | null;
  benefit_type: string | null;
  tuition_coverage: string | null;
  gpa_requirement: string | null;
  topik_requirement: string | null;
  deadline: string | null;
  deadline_type: string | null;
  status: string;
  source_url: string;
  deadline_label: string;
}

const TRACKED_KEY = "kmate-scholarship-studio-tracked";
const COMPARE_KEY = "kmate-scholarship-studio-compare";
const NOT_STATED = "Not stated in the official source";

function readLocal(key: string): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function requirementSummary(row: ScholarshipStudioRow) {
  const rules = [
    row.gpa_requirement ? "GPA" : null,
    row.topik_requirement ? "TOPIK" : null,
    row.degree_level ? "Degree" : null,
  ].filter(Boolean);
  return rules.length ? rules.join(" · ") : "Review official criteria";
}

export default function ScholarshipStudio({ rows }: { rows: ScholarshipStudioRow[] }) {
  const universities = useMemo(
    () => [...new Set(rows.map((row) => row.university_name))],
    [rows]
  );

  const [activeUniversity, setActiveUniversity] = useState<string>("all");
  const [previewUniversity, setPreviewUniversity] = useState<string>(universities[0] ?? "");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "expiring">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tracked, setTracked] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [pointer, setPointer] = useState({ x: 78, y: 28 });

  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      setTracked(readLocal(TRACKED_KEY));
      setCompare(readLocal(COMPARE_KEY).slice(0, 3));
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(TRACKED_KEY, JSON.stringify(tracked));
  }, [tracked, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(COMPARE_KEY, JSON.stringify(compare));
  }, [compare, hydrated]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (activeUniversity !== "all" && row.university_name !== activeUniversity) return false;
      if (statusFilter === "expiring" && row.status !== "expiring_soon") return false;
      if (!needle) return true;
      return [
        row.university_name,
        row.scholarship_name,
        row.scholarship_type,
        row.benefit_type,
        row.tuition_coverage,
        row.gpa_requirement,
        row.topik_requirement,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle));
    });
  }, [rows, query, activeUniversity, statusFilter]);

  const activePreview = useMemo(() => {
    const name = previewUniversity || universities[0] || "";
    const universityRows = rows.filter((row) => row.university_name === name);
    return {
      name,
      count: universityRows.length,
      place:
        name === "KAIST"
          ? "Daejeon"
          : name === "UNIST"
            ? "Ulsan"
            : name === "Korea University"
              ? "Seoul"
              : name === "Ajou University"
                ? "Suwon"
                : "South Korea",
      headline:
        universityRows.find((row) => row.tuition_coverage)?.tuition_coverage ??
        universityRows.find((row) => row.benefit_type)?.benefit_type ??
        "University-funded scholarship options",
    };
  }, [previewUniversity, rows, universities]);

  const compareRows = compare
    .map((id) => rows.find((row) => row.id === id))
    .filter((row): row is ScholarshipStudioRow => Boolean(row));

  const toggleTracked = (id: string) => {
    setTracked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const toggleCompare = (id: string) => {
    setCompare((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  };

  const filterUniversity = (university: string) => {
    setActiveUniversity(university);
    setPreviewUniversity(university === "all" ? universities[0] ?? "" : university);
    requestAnimationFrame(() => {
      document.getElementById("scholarship-stream")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 pb-28 pt-5 sm:px-6 lg:px-8">
      <nav className="sticky top-2 z-20 mb-3 flex items-center gap-1 overflow-x-auto rounded-xl border border-hairline bg-surface/88 p-1 shadow-xs backdrop-blur-xl md:top-3">
        <a
          href="#discover"
          className="shrink-0 rounded-lg bg-ink px-3.5 py-2 text-[12px] font-semibold text-white"
        >
          Discover
        </a>
        <Link
          href="/requirement-checker"
          className="shrink-0 rounded-lg px-3.5 py-2 text-[12px] font-medium text-muted transition-colors hover:bg-canvas hover:text-ink"
        >
          Eligibility
        </Link>
        <Link
          href="/application-readiness"
          className="shrink-0 rounded-lg px-3.5 py-2 text-[12px] font-medium text-muted transition-colors hover:bg-canvas hover:text-ink"
        >
          Applications
        </Link>
        <a
          href="#compare"
          className="shrink-0 rounded-lg px-3.5 py-2 text-[12px] font-medium text-muted transition-colors hover:bg-canvas hover:text-ink"
        >
          Compare
        </a>
        <span className="ml-auto hidden shrink-0 pr-2 text-[10px] font-medium text-muted/70 sm:block">
          Scholarship Studio · KMate
        </span>
      </nav>

      <section
        id="discover"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPointer({
            x: ((event.clientX - rect.left) / rect.width) * 100,
            y: ((event.clientY - rect.top) / rect.height) * 100,
          });
        }}
        className="relative isolate min-h-[570px] overflow-hidden rounded-[28px] bg-ink text-white shadow-pop"
        style={{
          backgroundImage: `radial-gradient(circle at ${pointer.x}% ${pointer.y}%, rgba(232,121,79,.17), transparent 26%), linear-gradient(145deg, #12141c 0%, #0d0f15 62%, #151116 100%)`,
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.055)_1px,transparent_1px)] [background-size:58px_58px] [mask-image:linear-gradient(to_bottom,black,transparent_92%)]" />

        <div className="relative z-10 flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 text-[10px] font-medium text-white/45 sm:px-7">
          <span>KMATE / SCHOLARSHIP STUDIO</span>
          <span className="hidden sm:block">UNIVERSITY FUNDING · KOREA</span>
          <span>{rows.length} LIVE INDEXED AWARDS</span>
        </div>

        <div className="relative z-10 grid min-h-[405px] gap-8 px-5 py-12 sm:px-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)] lg:px-10 lg:py-14">
          <div className="flex flex-col justify-end">
            <p className="mb-6 flex items-center gap-2 text-[11px] font-semibold text-white/52">
              <CircleDot className="h-3.5 w-3.5 text-gks-u" />
              Source-linked university scholarships
            </p>
            <h1 className="max-w-[870px] text-balance font-sans text-[clamp(52px,7.5vw,108px)] font-medium leading-[0.88] tracking-[-0.065em]">
              Scholarships
              <span className="block text-gks-u">worth your time.</span>
            </h1>
            <p className="mt-7 max-w-[620px] text-[14px] leading-7 text-white/58 sm:text-[15px]">
              Find university funding, inspect the published rules, save the awards that matter, and compare the terms without leaving KMate.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => document.getElementById("scholarship-stream")?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-gks-u px-4 text-[12px] font-semibold text-white transition-transform active:scale-[0.97]"
              >
                Explore scholarships
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                href="/requirement-checker"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/14 px-4 text-[12px] font-medium text-white/76 transition-colors hover:bg-white/7 hover:text-white"
              >
                Check my profile
              </Link>
            </div>
          </div>

          <div className="flex items-end lg:justify-end">
            <div className="w-full max-w-[390px] border-l border-white/12 pl-5 sm:pl-7">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">Live funding signal</p>
              <div className="mt-7 min-h-[178px]">
                <p className="text-[12px] text-white/38">{activePreview.place}</p>
                <p className="mt-2 font-sans text-[clamp(40px,4.3vw,64px)] font-medium leading-[0.94] tracking-[-0.055em]">
                  {activePreview.name || "University"}
                </p>
                <div className="mt-4 flex items-center gap-3 text-[11px] text-white/48">
                  <span>
                    <b className="text-gks-u">{activePreview.count}</b> indexed awards
                  </span>
                  <span className="h-1 w-1 rounded-full bg-white/20" />
                  <span>official sources</span>
                </div>
                <p className="mt-6 max-w-[320px] text-[12px] leading-6 text-white/62">
                  {activePreview.headline}
                </p>
              </div>
              <button
                type="button"
                onClick={() => filterUniversity(activePreview.name)}
                className="mt-5 inline-flex items-center gap-2 border-b border-white/25 pb-1 text-[11px] font-semibold text-white"
              >
                Show these awards
                <ArrowUpRight className="h-3.5 w-3.5 text-gks-u" />
              </button>
            </div>
          </div>
        </div>

        <div className="relative z-10 grid border-t border-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {universities.slice(0, 4).map((university, index) => {
            const count = rows.filter((row) => row.university_name === university).length;
            const active = previewUniversity === university;
            return (
              <button
                key={university}
                type="button"
                onPointerEnter={() => setPreviewUniversity(university)}
                onFocus={() => setPreviewUniversity(university)}
                onClick={() => filterUniversity(university)}
                className={cn(
                  "group relative min-h-[92px] border-b border-white/10 px-5 py-4 text-left transition-colors sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r lg:last:border-r-0",
                  active ? "bg-white/[0.055]" : "hover:bg-white/[0.035]"
                )}
              >
                <span className="text-[9px] font-semibold text-white/28">0{index + 1}</span>
                <p className="mt-4 font-sans text-[17px] font-medium tracking-[-0.03em] text-white/82 transition-colors group-hover:text-white">
                  {university}
                </p>
                <p className="mt-1 text-[9px] text-white/34">{count} awards</p>
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 w-[3px] bg-gks-u transition-opacity",
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                />
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-3 grid overflow-hidden rounded-xl border border-hairline bg-surface sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["01", "Discover", "Find university funding", "#scholarship-stream"],
          ["02", "Check", "Read the published rules", "/requirement-checker"],
          ["03", "Track", "Keep your next move visible", "/application-readiness"],
          ["04", "Compare", "Put the terms side by side", "#compare"],
        ].map(([number, label, detail, href], index) => {
          const content = (
            <>
              <span className="text-[9px] font-semibold text-muted/45">{number}</span>
              <div>
                <p className="font-sans text-[16px] font-medium tracking-[-0.025em] text-ink">{label}</p>
                <p className="mt-1 text-[10px] text-muted">{detail}</p>
              </div>
              <ArrowUpRight className="absolute right-4 top-4 h-3.5 w-3.5 text-muted/30 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gks-u" />
            </>
          );
          const classes = cn(
            "group relative grid min-h-[88px] grid-cols-[22px_1fr] gap-2 border-hairline px-4 py-4 transition-colors hover:bg-gks-u/[0.055]",
            index < 3 && "xl:border-r",
            index < 2 && "sm:border-b xl:border-b-0",
            index === 2 && "sm:border-r xl:border-r"
          );
          return href.startsWith("/") ? (
            <Link key={label} href={href} className={classes}>
              {content}
            </Link>
          ) : (
            <a key={label} href={href} className={classes}>
              {content}
            </a>
          );
        })}
      </section>

      <section id="scholarship-stream" className="scroll-mt-24 pt-8">
        <div className="sticky top-[70px] z-10 rounded-xl border border-hairline bg-surface/95 p-4 shadow-xs backdrop-blur-xl">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gks-u">Scholarship stream</p>
              <h2 className="mt-1 font-sans text-[clamp(26px,3vw,38px)] font-medium tracking-[-0.045em] text-ink">
                {rows.length} awards. One working view.
              </h2>
              <p className="mt-1 text-[11px] text-muted">Search, inspect, save and compare without leaving the page.</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted">
              <CircleDot className="h-3.5 w-3.5 text-success" />
              Live from KMate&apos;s scholarship index
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveUniversity("all")}
              className={cn(
                "shrink-0 rounded-lg border px-3 py-2 text-[10px] font-semibold transition-colors",
                activeUniversity === "all"
                  ? "border-ink bg-ink text-white"
                  : "border-border bg-white text-muted hover:text-ink"
              )}
            >
              All <span className="ml-1 text-[9px] opacity-60">{rows.length}</span>
            </button>
            {universities.map((university) => {
              const count = rows.filter((row) => row.university_name === university).length;
              return (
                <button
                  key={university}
                  type="button"
                  onClick={() => setActiveUniversity(university)}
                  className={cn(
                    "shrink-0 rounded-lg border px-3 py-2 text-[10px] font-semibold transition-colors",
                    activeUniversity === university
                      ? "border-ink bg-ink text-white"
                      : "border-border bg-white text-muted hover:text-ink"
                  )}
                >
                  {university} <span className="ml-1 text-[9px] opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_170px] xl:grid-cols-[minmax(0,1fr)_170px_170px_auto]">
            <label className="flex h-11 items-center gap-2 rounded-lg border border-border bg-canvas/65 px-3 focus-within:border-primary">
              <Search className="h-4 w-4 text-muted/60" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search awards, funding, GPA, TOPIK…"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted/50"
              />
            </label>
            <label className="relative flex h-11 items-center rounded-lg border border-border bg-white">
              <SlidersHorizontal className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted/55" />
              <select
                value={activeUniversity}
                onChange={(event) => setActiveUniversity(event.target.value)}
                className="h-full w-full appearance-none bg-transparent pl-9 pr-3 text-[11px] font-medium text-muted outline-none"
              >
                <option value="all">All universities</option>
                {universities.map((university) => (
                  <option key={university} value={university}>
                    {university}
                  </option>
                ))}
              </select>
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | "expiring")}
              className="h-11 rounded-lg border border-border bg-white px-3 text-[11px] font-medium text-muted outline-none"
            >
              <option value="all">All deadlines</option>
              <option value="expiring">Closing soon</option>
            </select>
            <div className="flex h-11 items-center justify-between gap-2 rounded-lg border border-border bg-canvas/60 px-3 text-[10px] text-muted">
              <span>{filtered.length} shown</span>
              {(query || activeUniversity !== "all" || statusFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setActiveUniversity("all");
                    setStatusFilter("all");
                  }}
                  className="font-semibold text-ink"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 border-t border-hairline-strong">
          {filtered.length === 0 ? (
            <div className="py-14 text-center">
              <p className="font-sans text-[20px] font-medium text-ink">Nothing matches this view.</p>
              <p className="mt-2 text-[12px] text-muted">Try another university or clear the search.</p>
            </div>
          ) : (
            filtered.map((row, index) => {
              const isOpen = expanded === row.id;
              const isTracked = tracked.includes(row.id);
              const isCompared = compare.includes(row.id);
              return (
                <article
                  key={row.id}
                  className={cn(
                    "group relative border-b border-hairline-strong transition-colors hover:bg-surface",
                    (isTracked || isCompared) && "bg-surface/65"
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 w-[3px] transition-colors",
                      isCompared ? "bg-gks-u" : isTracked ? "bg-success" : "bg-transparent group-hover:bg-gks-u"
                    )}
                  />
                  <div className="grid gap-4 px-2 py-5 sm:px-4 lg:grid-cols-[150px_minmax(260px,1.15fr)_minmax(190px,.72fr)_minmax(210px,.82fr)_42px] lg:items-start lg:gap-5">
                    <div className="flex items-start justify-between gap-3 lg:block">
                      <div>
                        <p className="text-[9px] font-semibold text-muted/45">0{index + 1}</p>
                        <p className="mt-3 text-[11px] font-semibold text-ink">{row.university_name}</p>
                        <p className="mt-1 text-[9px] text-muted">{row.degree_level ?? "Undergraduate"}</p>
                      </div>
                      <div className="lg:mt-3">
                        {row.status === "expiring_soon" ? (
                          <span className="rounded-full bg-gold-soft px-2 py-1 text-[9px] font-semibold text-gold">Closing soon</span>
                        ) : (
                          <span className="rounded-full bg-success-soft px-2 py-1 text-[9px] font-semibold text-success">Active</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted/45">
                        {row.scholarship_type ?? "University scholarship"}
                      </p>
                      <h3 className="mt-2 max-w-[640px] font-sans text-[clamp(20px,2vw,28px)] font-medium leading-[1.05] tracking-[-0.04em] text-ink">
                        {row.scholarship_name}
                      </h3>
                      <p className="mt-3 text-[11px] leading-5 text-muted">
                        Deadline · <span className="text-ink">{row.deadline_label}</span>
                      </p>
                    </div>

                    <div className="border-hairline lg:border-l lg:pl-5">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted/45">Published funding</p>
                      <p className="mt-2 font-sans text-[14px] font-medium leading-5 text-ink">
                        {row.tuition_coverage ?? row.benefit_type ?? NOT_STATED}
                      </p>
                      {row.benefit_type && row.tuition_coverage && (
                        <p className="mt-2 text-[9px] leading-4 text-muted">{row.benefit_type}</p>
                      )}
                    </div>

                    <div className="border-hairline lg:border-l lg:pl-5">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted/45">Published criteria</p>
                      <p className="mt-2 text-[11px] font-medium text-ink">{requirementSummary(row)}</p>
                      <p className="mt-2 text-[9px] leading-4 text-muted">
                        {row.gpa_requirement ?? row.topik_requirement ?? "Open the official source for full conditions."}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : row.id)}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? "Collapse scholarship details" : "Expand scholarship details"}
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white transition-colors hover:border-gks-u/40 hover:bg-gks-u/5",
                        isOpen && "border-gks-u bg-gks-u text-white hover:bg-gks-u"
                      )}
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")} />
                    </button>
                  </div>

                  <div
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="mx-2 mb-5 grid gap-3 rounded-xl border border-hairline bg-surface p-4 sm:mx-4 lg:grid-cols-4">
                        {[
                          ["Deadline", row.deadline_label],
                          ["GPA", row.gpa_requirement ?? NOT_STATED],
                          ["TOPIK", row.topik_requirement ?? NOT_STATED],
                          ["Tuition", row.tuition_coverage ?? NOT_STATED],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted/45">{label}</p>
                            <p className="mt-2 text-[11px] leading-5 text-ink">{value}</p>
                          </div>
                        ))}

                        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4 lg:col-span-4">
                          <button
                            type="button"
                            onClick={() => toggleTracked(row.id)}
                            className={cn(
                              "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[10px] font-semibold transition-colors",
                              isTracked
                                ? "border-success/30 bg-success-soft text-success"
                                : "border-border bg-white text-ink hover:bg-canvas"
                            )}
                          >
                            {isTracked ? <Check className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                            {isTracked ? "Tracked" : "Track"}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleCompare(row.id)}
                            disabled={!isCompared && compare.length >= 3}
                            className={cn(
                              "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[10px] font-semibold transition-colors",
                              isCompared
                                ? "border-gks-u/30 bg-gks-u/10 text-gks-u"
                                : "border-border bg-white text-ink hover:bg-canvas"
                            )}
                          >
                            <GitCompareArrows className="h-3.5 w-3.5" />
                            {isCompared ? "In comparison" : "Compare"}
                          </button>
                          <a
                            href={row.source_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-3 text-[10px] font-semibold text-white"
                          >
                            Official source
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section id="compare" className="scroll-mt-24 pt-10">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gks-u">Comparison field</p>
            <h2 className="mt-1 font-sans text-[clamp(28px,3vw,40px)] font-medium tracking-[-0.045em] text-ink">
              Compare the terms, not the hype.
            </h2>
            <p className="mt-2 text-[11px] text-muted">Choose up to three awards from the stream above.</p>
          </div>
          {compareRows.length > 0 && (
            <button
              type="button"
              onClick={() => setCompare([])}
              className="inline-flex h-9 items-center gap-2 self-start rounded-lg border border-border bg-white px-3 text-[10px] font-semibold text-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        {compareRows.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-hairline-strong bg-surface/70 px-6 py-12 text-center">
            <GitCompareArrows className="mx-auto h-6 w-6 text-muted/35" />
            <p className="mt-4 font-sans text-[18px] font-medium text-ink">Your comparison is empty.</p>
            <p className="mt-2 text-[11px] text-muted">Open an award and add it to comparison.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-hairline bg-surface">
            <table className="min-w-[760px] w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline bg-canvas/60">
                  <th className="w-[150px] px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted/50">Field</th>
                  {compareRows.map((row) => (
                    <th key={row.id} className="min-w-[210px] border-l border-hairline px-4 py-3 align-top">
                      <p className="text-[9px] font-semibold text-gks-u">{row.university_name}</p>
                      <p className="mt-1 font-sans text-[14px] font-medium leading-5 tracking-[-0.025em] text-ink">{row.scholarship_name}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Deadline", (row: ScholarshipStudioRow) => row.deadline_label],
                  ["Funding", (row: ScholarshipStudioRow) => row.tuition_coverage ?? row.benefit_type ?? NOT_STATED],
                  ["GPA", (row: ScholarshipStudioRow) => row.gpa_requirement ?? NOT_STATED],
                  ["TOPIK", (row: ScholarshipStudioRow) => row.topik_requirement ?? NOT_STATED],
                ].map(([label, getter]) => (
                  <tr key={String(label)} className="border-b border-hairline last:border-0">
                    <th className="bg-canvas/35 px-4 py-4 text-[10px] font-medium text-muted">{String(label)}</th>
                    {compareRows.map((row) => (
                      <td key={row.id} className="border-l border-hairline px-4 py-4 text-[11px] leading-5 text-ink">
                        {(getter as (row: ScholarshipStudioRow) => string)(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {compareRows.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 flex w-[min(620px,calc(100vw-28px))] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-ink/95 p-2.5 pl-4 text-white shadow-pop backdrop-blur-xl md:left-[calc(210px+(100vw-210px)/2)] md:w-[min(620px,calc(100vw-250px))]">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold text-white/42">{compareRows.length}/3 selected</p>
            <div className="mt-1 flex max-w-[340px] gap-1.5 overflow-hidden">
              {compareRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => toggleCompare(row.id)}
                  className="flex h-7 max-w-[110px] items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[8px] text-white/70"
                >
                  <span className="truncate">{row.university_name}</span>
                  <X className="h-2.5 w-2.5 shrink-0 text-gks-u" />
                </button>
              ))}
            </div>
          </div>
          <a
            href="#compare"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-gks-u px-3.5 text-[10px] font-semibold text-white"
          >
            Compare now
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </main>
  );
}
