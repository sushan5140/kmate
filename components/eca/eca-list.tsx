"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { UpvoteButton } from "@/components/interview-db/upvote-button";
import { ReportBlockMenu } from "@/components/profile/report-block-menu";
import { cn } from "@/lib/cn";
import {
  ECA_TRACKS,
  ECA_TRACK_LABELS,
  ECA_ACTIVITY_TYPES,
  ECA_ACTIVITY_TYPE_LABELS,
  ECA_IMPACT_AREA_LABELS,
  CONFIDENCE_LABELS,
  type EcaTrack,
  type EcaActivityType,
  type EcaImpactArea,
  type Confidence,
} from "@/lib/constants";

export interface EcaEntryData {
  id: string;
  title: string;
  description: string | null;
  track: EcaTrack;
  upvotesCount: number;
  upvotedByMe: boolean;
  activityType: EcaActivityType | null;
  impactArea: EcaImpactArea | null;
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

export function EcaList({ entries }: { entries: EcaEntryData[] }) {
  const [track, setTrack] = useState<EcaTrack | "all">("all");
  const [activityType, setActivityType] = useState<EcaActivityType | "all">("all");

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (track !== "all" && e.track !== track && e.track !== "both") return false;
      if (activityType !== "all" && e.activityType !== activityType) return false;
      return true;
    });
  }, [entries, track, activityType]);

  return (
    <div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Track</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Chip active={track === "all"} onClick={() => setTrack("all")}>
            All
          </Chip>
          {ECA_TRACKS.map((t) => (
            <Chip key={t} active={track === t} onClick={() => setTrack(t)}>
              {ECA_TRACK_LABELS[t]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Activity type</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Chip active={activityType === "all"} onClick={() => setActivityType("all")}>
            All
          </Chip>
          {ECA_ACTIVITY_TYPES.map((t) => (
            <Chip key={t} active={activityType === t} onClick={() => setActivityType(t)}>
              {ECA_ACTIVITY_TYPE_LABELS[t]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {filtered.length === 0 ? (
          <p className="text-[14px] text-muted">No extracurriculars match this filter yet.</p>
        ) : (
          filtered.map((entry) => (
            <Card key={entry.id} className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-primary">
                    {ECA_TRACK_LABELS[entry.track]}
                  </span>
                  {entry.activityType && (
                    <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-muted">
                      {ECA_ACTIVITY_TYPE_LABELS[entry.activityType]}
                    </span>
                  )}
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
                {entry.impactArea && (
                  <p className="mt-1 text-[12px] font-medium text-muted">{ECA_IMPACT_AREA_LABELS[entry.impactArea]}</p>
                )}
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
                <UpvoteButton questionId={entry.id} initialCount={entry.upvotesCount} initialUpvoted={entry.upvotedByMe} endpoint="/api/eca" />
                <ReportBlockMenu targetType="eca" targetId={entry.id} />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
