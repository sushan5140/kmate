import { deadlineBannerCopy } from "@/lib/deadline";
import type { Track } from "@/lib/constants";

/** The deadline copy for the home page's application-calendar card. */
export function DeadlineBannerText({ track }: { track: Track }) {
  const { prepBy, official } = deadlineBannerCopy(track);
  return (
    <>
      <h2 className="mt-1 text-[19px] font-semibold leading-snug">{prepBy}</h2>
      <p className="mt-1 text-[13.5px] text-white/70">{official}</p>
    </>
  );
}
