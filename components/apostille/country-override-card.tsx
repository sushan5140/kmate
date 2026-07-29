import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { CountryOverride } from "@/lib/apostille-requirements";

export function CountryOverrideCard({ data }: { data: CountryOverride }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{data.country}</h3>
        <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          {data.trackLabel}
        </span>
      </div>
      <p className="mt-0.5 text-[12px] text-muted">{data.embassyOrConsulate}</p>

      <p className="mt-3 text-[13.5px] leading-relaxed text-ink">{data.summary}</p>

      <p className="mt-3 text-[12.5px] text-muted">
        <span className="font-medium text-ink">Hague Apostille Convention member:</span> {data.hagueConventionMember}
      </p>

      <div className="mt-3 rounded-lg bg-danger-soft px-3.5 py-3 text-[12.5px] leading-relaxed text-danger">{data.caveat}</div>

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
