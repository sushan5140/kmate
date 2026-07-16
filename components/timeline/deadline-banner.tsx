import { Card, MicroLabel } from "@/components/ui/card";
import { deadlineBannerCopy } from "@/lib/timeline/deadline";
import type { Track } from "@/lib/constants";

/** Full, self-contained banner card -- used at the top of the Timeline page. */
export function DeadlineBanner({ track }: { track: Track }) {
  const { prepBy, official } = deadlineBannerCopy(track);
  return (
    <Card className="mt-4 bg-primary text-white">
      <MicroLabel className="text-white/60">Application calendar</MicroLabel>
      <h2 className="mt-1 text-[19px] font-semibold leading-snug">{prepBy}</h2>
      <p className="mt-1 text-[13.5px] text-white/70">{official}</p>
    </Card>
  );
}

/** Just the two lines, no card/label -- for dropping into an existing card (Home hero). */
export function DeadlineBannerText({ track }: { track: Track }) {
  const { prepBy, official } = deadlineBannerCopy(track);
  return (
    <>
      <h2 className="mt-1 text-[19px] font-semibold leading-snug">{prepBy}</h2>
      <p className="mt-1 text-[13.5px] text-white/70">{official}</p>
    </>
  );
}
