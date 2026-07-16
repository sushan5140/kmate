"use client";

import { useMemo, useState } from "react";
import { Search, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { VoteButtons } from "@/components/ui/vote-buttons";
import { ReportBlockMenu } from "@/components/profile/report-block-menu";
import { cn } from "@/lib/cn";
import {
  MISTAKE_DOCUMENT_TYPES,
  MISTAKE_DOCUMENT_TYPE_LABELS,
  MISTAKE_REASON_CATEGORIES,
  MISTAKE_REASON_CATEGORY_LABELS,
  CONFIDENCE_LABELS,
  type MistakeDocumentType,
  type MistakeReasonCategory,
  type Confidence,
} from "@/lib/constants";

export interface MistakeEntryData {
  id: string;
  title: string;
  description: string | null;
  documentType: MistakeDocumentType;
  reasonCategory: MistakeReasonCategory;
  upvotesCount: number;
  downvotesCount: number;
  voteType: "up" | "down" | null;
  confidence: Confidence | null;
  sourceUrl: string | null;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[12.5px] font-medium",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-muted"
      )}
    >
      {children}
    </button>
  );
}

export function MistakesList({ entries }: { entries: MistakeEntryData[] }) {
  const [search, setSearch] = useState("");
  const [documentType, setDocumentType] = useState<MistakeDocumentType | "all">("all");
  const [reasonCategory, setReasonCategory] = useState<MistakeReasonCategory | "all">("all");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (documentType !== "all" && e.documentType !== documentType) return false;
      if (reasonCategory !== "all" && e.reasonCategory !== reasonCategory) return false;
      if (needle && !e.title.toLowerCase().includes(needle) && !(e.description ?? "").toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [entries, documentType, reasonCategory, search]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by document type or reason…"
          className="w-full rounded-xl border border-border bg-white py-2.5 pl-10 pr-4 text-[14px] text-ink outline-none focus:border-primary"
        />
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Document</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Chip active={documentType === "all"} onClick={() => setDocumentType("all")}>
            All
          </Chip>
          {MISTAKE_DOCUMENT_TYPES.map((d) => (
            <Chip key={d} active={documentType === d} onClick={() => setDocumentType(d)}>
              {MISTAKE_DOCUMENT_TYPE_LABELS[d]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Reason</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Chip active={reasonCategory === "all"} onClick={() => setReasonCategory("all")}>
            All
          </Chip>
          {MISTAKE_REASON_CATEGORIES.map((r) => (
            <Chip key={r} active={reasonCategory === r} onClick={() => setReasonCategory(r)}>
              {MISTAKE_REASON_CATEGORY_LABELS[r]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {filtered.length === 0 ? (
          <p className="text-[14px] text-muted">No entries match this filter yet.</p>
        ) : (
          filtered.map((entry) => (
            <Card key={entry.id} className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-danger">
                    {MISTAKE_DOCUMENT_TYPE_LABELS[entry.documentType]}
                  </span>
                  <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-muted">
                    {MISTAKE_REASON_CATEGORY_LABELS[entry.reasonCategory]}
                  </span>
                  {entry.confidence && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
                        entry.confidence === "recurring_theme" ? "bg-success/10 text-success" : "bg-gold/10 text-gold"
                      )}
                    >
                      {CONFIDENCE_LABELS[entry.confidence]}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[14.5px] font-medium text-ink">{entry.title}</p>
                {entry.description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{entry.description}</p>}
                {entry.sourceUrl && (
                  <a
                    href={entry.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                  >
                    Source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <VoteButtons
                  endpoint={`/api/mistakes/${entry.id}`}
                  initialUpvotes={entry.upvotesCount}
                  initialDownvotes={entry.downvotesCount}
                  initialVoteType={entry.voteType}
                />
                <ReportBlockMenu targetType="mistake" targetId={entry.id} />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
