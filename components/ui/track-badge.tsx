import { cn } from "@/lib/cn";
import { TRACK_BADGE_CLASS, TRACK_LABELS, type Track } from "@/lib/constants";

export function TrackBadge({ track, className }: { track: Track; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
        TRACK_BADGE_CLASS[track],
        className
      )}
    >
      {TRACK_LABELS[track]}
    </span>
  );
}
