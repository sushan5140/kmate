"use client";

import { AlertTriangle, ExternalLink, Info } from "lucide-react";
import { Card, MicroLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { unconditionalRequiredNotApplicable } from "@/lib/readiness/summary";
import type {
  ApplicantDocumentState,
  ReadinessCategory,
  ReadinessItem,
  ReadinessStatus,
} from "@/lib/readiness/schema";

/**
 * One checklist section: the common application documents, or one university's
 * own requirements.
 *
 * Presentational and storage-agnostic -- the workspace owns where progress
 * lives and hands each section its own change handler, which is what keeps one
 * university's ticks out of another's.
 */

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

export function ChecklistSection({
  heading,
  subheading,
  items,
  onChange,
  emptyNote,
}: {
  heading: string;
  subheading?: string;
  items: ReadinessItem[];
  onChange: (id: string, state: ApplicantDocumentState | null) => void;
  emptyNote?: string;
}) {
  const waived = unconditionalRequiredNotApplicable(items);

  if (items.length === 0) {
    return (
      <Card className="flex flex-col gap-1.5">
        <h2 className="text-[15px] font-semibold leading-snug text-ink">{heading}</h2>
        {/* An empty section says the dataset records nothing, never that the
            university has no requirements. */}
        <p className="text-[12.5px] leading-relaxed text-muted">
          {emptyNote ?? "Nothing to show for this selection."}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-semibold leading-snug text-ink">{heading}</h2>
        {subheading && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{subheading}</p>}
      </div>

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
              in the verified source, so {waived.length === 1 ? "it applies" : "they apply"} to every applicant
              on this route. Confirm with the first-round institution before treating{" "}
              {waived.length === 1 ? "it" : "them"} as not applicable.
            </p>
          </div>
        </Card>
      )}

      {GROUPS.map((group) => {
        const groupItems = items.filter((i) => i.category === group.category);
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
                <ChecklistRow key={item.id} item={item} onChange={onChange} />
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
    <li className={cn("rounded-xl border px-3.5 py-3", flagged ? "border-gold bg-gold/5" : "border-hairline")}>
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
