import { AlertTriangle } from "lucide-react";
import { APOSTILLE_DISCLAIMER } from "@/lib/apostille-requirements";

// Deliberately a full-width, high-contrast banner rather than a small caption
// or tooltip -- its whole job is to stop someone from a divergent-requirement
// country walking away thinking the general tables below are their complete
// answer, so it has to be impossible to skim past.
export function DisclaimerBanner() {
  return (
    <div className="mt-4 flex gap-3 rounded-2xl bg-gold-soft px-5 py-4 ring-1 ring-gold/25">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-gold">Check your own country&apos;s requirements</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink">{APOSTILLE_DISCLAIMER}</p>
      </div>
    </div>
  );
}
