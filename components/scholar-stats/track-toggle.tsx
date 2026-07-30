"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { ScholarStatsApp, type TrackData } from "./scholar-stats-app";
import { TRACK_LABELS, type Track } from "@/lib/constants";

// Only rendered for profiles.dual_track_access = true (an admin-granted
// override, see /admin/users) -- everyone else gets ScholarStatsApp
// rendered directly for their own track only, no toggle, no way to reach
// the other track's data.
export function ScholarStatsTrackToggle({
  defaultTrack,
  gksG,
  gksU,
}: {
  defaultTrack: Track;
  gksG: TrackData;
  gksU: TrackData;
}) {
  const [track, setTrack] = useState<Track>(defaultTrack);
  const data = track === "gks_g" ? gksG : gksU;

  return (
    <div>
      <div className="mt-4 flex gap-1.5">
        {(["gks_g", "gks_u"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTrack(t)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-colors",
              track === t
                ? t === "gks_g"
                  ? "border-gks-g bg-gks-g/10 text-gks-g"
                  : "border-gks-u bg-gks-u/10 text-gks-u"
                : "border-hairline-strong text-muted hover:text-ink"
            )}
          >
            {TRACK_LABELS[t]}
          </button>
        ))}
      </div>
      <ScholarStatsApp data={data} />
    </div>
  );
}
