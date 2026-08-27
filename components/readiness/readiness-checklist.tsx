"use client";

import { useMemo, useSyncExternalStore } from "react";
import { AlertTriangle, ExternalLink, Info, RotateCcw } from "lucide-react";
import { Card, MicroLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  allRequiredTracked,
  summarizeReadiness,
  unconditionalRequiredNotApplicable,
} from "@/lib/readiness/summary";
import type {
  ApplicantDocumentState,
  ReadinessCategory,
  ReadinessItem,
  ReadinessStatus,
} from "@/lib/readiness/schema";

/**
 * Step 6 -- the checklist itself.
 *
 * Progress is per applicant and per application configuration, so it lives in
 * this browser under a key built from program + track + program type +
 * university. Nothing is written to the database in this version. The page
 * remounts this component whenever that configuration changes (see the `key`
 * in page.tsx), so one university's progress can never appear under another's.
 */

const STORAGE_PREFIX = "kmate:readiness:v1:";

const GROUPS: { category: ReadinessCategory; label: string }[] = [
  { category: "gks_form", label: "GKS Forms" },
  { category: "academic", label: "Academic Documents" },
  { category: "certificate", label: "Citizenship / Family Documents" },
  { category: "identity", label: "Identity" },
  { category: "supporting", label: "Supporting Documents" },
  { category: "authentication", label: "Authentication" },
  { category: "university_extra", label: "University-specific Requirements" },
];

const STATUS: Record<ReadinessStatus, { label: string; chip: string; blurb?: string }> = {
  required: { label: "Required", chip: "bg-primary/10 text-primary" },
  conditional: {
    label: "Conditional",
    chip: "bg-gold/10 text-gold",
    blurb: "Applies only in the case described below.",
  },
  optional: { label: "Optional", chip: "bg-canvas text-muted" },
  not_stated: {
    label: "Not stated",
    chip: "bg-canvas text-muted",
    blurb:
      "Not stated by the verified source. That is not the same as there being no requirement — check the official instructions.",
  },
};

const PROGRESS: { value: ApplicantDocumentState; label: string }[] = [
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In progress" },
  { value: "missing", label: "Missing" },
  { value: "not_applicable", label: "Not applicable" },
];

type ProgressMap = Record<string, ApplicantDocumentState>;

/**
 * localStorage is an external store, so it is read through
 * useSyncExternalStore rather than copied into state inside an effect. That
 * keeps the server render and the hydrated render consistent by construction
 * (the server snapshot is simply "nothing saved"), and it means a second tab
 * editing the same checklist updates this one through the `storage` event.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Writes in this tab do not fire `storage`, so they notify subscribers directly. */
function emit() {
  for (const l of listeners) l();
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // A private window or blocked site data -- the checklist still works, it
    // just cannot remember anything.
    return null;
  }
}

export function ReadinessChecklist({
  storageKey,
  items,
  warnings,
}: {
  storageKey: string;
  items: ReadinessItem[];
  warnings: string[];
}) {
  const key = STORAGE_PREFIX + storageKey;
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null
  );
  const progress = useMemo<ProgressMap>(() => {
    if (!raw) return {};
    try {
      return JSON.parse(raw) as ProgressMap;
    } catch {
      // Corrupt entry -- start clean rather than breaking the checklist.
      return {};
    }
  }, [raw]);

  function write(next: ProgressMap) {
    try {
      if (Object.keys(next).length === 0) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Nothing to do -- the value simply is not remembered.
    }
    emit();
  }

  function update(id: string, state: ApplicantDocumentState | null) {
    const next = { ...progress };
    if (state === null) delete next[id];
    else next[id] = state;
    write(next);
  }

  function resetChecklist() {
    // Only this configuration's key is cleared -- every other university's
    // saved checklist is left untouched.
    write({});
  }

  // Annotated rather than inferred: without it the index lookup is treated as
  // always defined, so `progress` narrows to ApplicantDocumentState and the
  // "untracked" comparisons below become type errors.
  const tracked: ReadinessItem[] = useMemo(
    () => items.map((item) => ({ ...item, progress: progress[item.id] ?? "untracked" })),
    [items, progress]
  );

  const summary = summarizeReadiness(tracked);
  const everyRequiredTracked = allRequiredTracked(tracked);
  const waived = unconditionalRequiredNotApplicable(tracked);
  const untrackedRequired = summary.required_total - tracked.filter((i) => i.status === "required" && i.progress !== "untracked").length;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <MicroLabel>Application readiness</MicroLabel>
            <p className="mt-1 text-[16px] font-semibold text-ink">
              {summary.required_ready} / {summary.required_total} required documents ready
            </p>
          </div>
          <button
            type="button"
            onClick={resetChecklist}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset checklist
          </button>
        </div>

        <div
          className="h-2 w-full overflow-hidden rounded-full bg-canvas"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={summary.required_total}
          aria-valuenow={summary.required_ready}
          aria-label="Required documents ready"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{
              width: `${summary.required_total ? (summary.required_ready / summary.required_total) * 100 : 0}%`,
            }}
          />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
          <span>
            Required missing: <span className="font-medium text-ink">{summary.required_missing}</span>
          </span>
          <span>
            Conditional items: <span className="font-medium text-ink">{summary.conditional_total}</span>
          </span>
          <span>
            Optional items: <span className="font-medium text-ink">{summary.optional_total}</span>
          </span>
          {!everyRequiredTracked && (
            <span>
              Not yet tracked: <span className="font-medium text-ink">{untrackedRequired}</span>
            </span>
          )}
        </div>

        {/* An untracked document is unknown, not done -- so the figure is a
            share of ALL required documents and only reaches 100% when every
            one of them has actually been marked ready. */}
        <p className="text-[12px] leading-relaxed text-muted">
          {summary.completion_percent === null
            ? "Mark a document below to start tracking your progress."
            : `${summary.completion_percent}% of required documents marked ready.`}{" "}
          This checklist shows what the verified sources state — it does not confirm that you are eligible
          or that your application is ready to submit.
        </p>
      </Card>

      {waived.length > 0 && (
        <Card className="flex items-start gap-2 bg-gold/5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <div>
            <p className="text-[13.5px] font-medium text-ink">
              {waived.length === 1 ? "A required document is" : `${waived.length} required documents are`}{" "}
              marked &ldquo;Not applicable&rdquo;
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              {waived.map((i) => i.label).join(", ")} {waived.length === 1 ? "carries" : "carry"} no condition
              in the verified source, so {waived.length === 1 ? "it applies" : "they apply"} to every
              applicant for this program. Confirm with the first-round institution before treating{" "}
              {waived.length === 1 ? "it" : "them"} as not applicable.
            </p>
          </div>
        </Card>
      )}

      {warnings.length > 0 && (
        <Card className="flex flex-col gap-2">
          <MicroLabel>Before you rely on this</MicroLabel>
          <ul className="flex flex-col gap-1.5">
            {warnings.map((w, i) => (
              <li key={i} className="text-[12.5px] leading-relaxed text-muted">
                · {w}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {GROUPS.map((group) => {
        const groupItems = tracked.filter((i) => i.category === group.category);
        if (groupItems.length === 0) return null;
        return (
          <Card key={group.category} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MicroLabel>{group.label}</MicroLabel>
              <span className="text-[11.5px] text-muted">{groupItems.length}</span>
            </div>

            {group.category === "authentication" && (
              <div className="flex items-start gap-2 rounded-xl bg-canvas px-3.5 py-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <p className="text-[12.5px] leading-relaxed text-muted">
                  Authentication requirements can vary by document, issuing country and first-round
                  institution. Check the current official embassy/university instructions.
                </p>
              </div>
            )}

            <ul className="flex flex-col gap-2.5">
              {groupItems.map((item) => (
                <ChecklistRow key={item.id} item={item} onChange={update} />
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function ChecklistRow({
  item,
  onChange,
}: {
  item: ReadinessItem;
  onChange: (id: string, state: ApplicantDocumentState | null) => void;
}) {
  const s = STATUS[item.status];
  const flagged = item.status === "required" && !item.condition && item.progress === "not_applicable";

  return (
    <li
      className={cn(
        "rounded-xl border px-3.5 py-3",
        flagged ? "border-gold bg-gold/5" : "border-hairline"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-ink">{item.label}</p>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11.5px] font-medium",
            s.chip
          )}
        >
          {s.label}
        </span>
      </div>

      {/* The conditional blurb points at a condition line, so it is only shown
          when the source actually stated one -- a verified university process
          entry carries prose instead, and would otherwise promise a condition
          that is not there. */}
      {s.blurb && (item.status !== "conditional" || item.condition) && (
        <p className="mt-1 text-[12px] leading-relaxed text-muted">{s.blurb}</p>
      )}

      {item.condition && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          <span className="font-medium text-ink">Condition:</span> {item.condition}
        </p>
      )}

      {item.notes && (
        <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">{item.notes}</p>
      )}

      {flagged && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-gold">
          This document is required with no stated exception. Confirm with the first-round institution before
          treating it as not applicable.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {PROGRESS.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={item.progress === p.value}
            onClick={() => onChange(item.id, item.progress === p.value ? null : p.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[12px] font-medium",
              item.progress === p.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-white text-muted hover:text-ink"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {item.sourceUrls.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <MicroLabel>Source</MicroLabel>
          {item.sourceUrls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 truncate text-[12px] font-medium text-primary hover:underline"
            >
              <span className="truncate">{hostOf(url)}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ))}
        </div>
      )}
    </li>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
