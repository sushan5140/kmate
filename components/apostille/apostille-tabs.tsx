"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { GeneralDefaultSection } from "./general-default-section";
import { APOSTILLE_GENERAL_DEFAULT } from "@/lib/apostille-requirements";
import { TRACK_LABELS, type Track } from "@/lib/constants";

// Both tracks' full content is always available -- this only controls which
// one is visible at a time, it never hides a track based on who's viewing
// (no per-user filtering here, deliberately, per how this feature was scoped).
export function ApostilleTabs({ defaultTrack }: { defaultTrack: Track }) {
  const [track, setTrack] = useState<Track>(defaultTrack);

  return (
    <div className="mt-6">
      <div className="flex gap-1.5">
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

      <GeneralDefaultSection data={APOSTILLE_GENERAL_DEFAULT[track]} />
    </div>
  );
}
