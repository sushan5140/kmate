import { cn } from "@/lib/cn";
import { TRACK_BADGE_CLASS, TRACK_LABELS, type Track } from "@/lib/constants";

export function TrackBadge({ track, className }: { track: Track; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[8px] border border-current/10 px-2.5 py-1 text-[10.5px] font-extrabold",
        TRACK_BADGE_CLASS[track],
        className
      )}
    >
      {TRACK_LABELS[track]}
    </span>
  );
}
