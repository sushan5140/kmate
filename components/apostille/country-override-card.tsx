import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { CountryOverride } from "@/lib/apostille-requirements";
import type { Track } from "@/lib/constants";

export function CountryOverrideCard({
  data,
  track,
  expectedCycle,
}: {
  data: CountryOverride;
  track: Track;
  expectedCycle: string;
}) {
  const verifiedCycle = data.verifiedCycleByTrack[track] ?? null;
  const current = verifiedCycle === expectedCycle;

  return (
    <Card className={current ? "" : "border-gold/20 bg-gold/[0.03]"}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{data.country}</h3>
        <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          {data.trackLabel}
        </span>
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold " +
            (current ? "bg-success/10 text-success" : "bg-gold/10 text-gold")
          }
        >
          {current ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {current
            ? `${expectedCycle} cycle verified`
            : verifiedCycle
              ? `Previous-cycle notice (${verifiedCycle})`
              : `No ${expectedCycle} ${track === "gks_u" ? "GKS-U" : "GKS-G"} verification`}
        </span>
      </div>
      <p className="mt-0.5 text-[12px] text-muted">{data.embassyOrConsulate}</p>

      <p className="mt-3 text-[13.5px] leading-relaxed text-ink">{data.summary}</p>

      <p className="mt-3 text-[12.5px] text-muted">
        <span className="font-medium text-ink">Hague Apostille Convention member:</span>{" "}
        {data.hagueConventionMember}
      </p>

      <div
        className={
          "mt-3 rounded-lg px-3.5 py-3 text-[12.5px] leading-relaxed " +
          (current ? "bg-danger-soft text-danger" : "bg-gold/10 text-ink")
        }
      >
        {data.caveat}
      </div>

      <div className="mt-3 flex flex-col gap-1">
        {data.source.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1 text-[12px] text-muted hover:text-primary"
          >
            <ExternalLink className="h-3 w-3" />
            {s.label}
          </a>
        ))}
        <p className="text-[12px] text-muted">Last checked {data.lastCheckedDate}</p>
      </div>
    </Card>
  );
}
