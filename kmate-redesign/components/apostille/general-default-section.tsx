import { ExternalLink } from "lucide-react";
import type { ApostilleGeneralDefault } from "@/lib/apostille-requirements";

export function GeneralDefaultSection({ data }: { data: ApostilleGeneralDefault }) {
  const { documentsRequiringAuthentication: docs } = data;

  return (
    <div className="mt-4">
      <ul className="flex flex-col gap-2">
        {data.summary.map((point, i) => (
          <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-ink">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted" />
            {point}
          </li>
        ))}
      </ul>

      <h3 className="mt-5 text-[14px] font-semibold text-ink">Documents requiring apostille or consular confirmation</h3>
      <p className="mt-1 text-[12.5px] text-muted">{docs.note}</p>

      <div className="mt-2.5 overflow-x-auto rounded-lg ring-1 ring-hairline">
        {docs.gksU && (
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-hairline bg-surface">
                <th className="px-3 py-2 font-semibold text-ink">Document</th>
                <th className="px-3 py-2 font-semibold text-ink">Requirement</th>
              </tr>
            </thead>
            <tbody>
              {docs.gksU.map((row) => (
                <tr key={row.no} className="border-b border-hairline bg-surface last:border-0">
                  <td className="px-3 py-2 align-top text-ink">{row.name}</td>
                  <td className="px-3 py-2 align-top">
                    <span className={row.requirement === "Required" ? "font-medium text-danger" : "text-muted"}>{row.requirement}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {docs.gksG && (
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-hairline bg-surface">
                <th className="px-3 py-2 font-semibold text-ink">Document</th>
                <th className="px-3 py-2 font-semibold text-ink">Master&apos;s</th>
                <th className="px-3 py-2 font-semibold text-ink">Doctoral</th>
              </tr>
            </thead>
            <tbody>
              {docs.gksG.map((row) => (
                <tr key={row.no} className="border-b border-hairline bg-surface last:border-0">
                  <td className="px-3 py-2 align-top text-ink">{row.name}</td>
                  <td className="px-3 py-2 align-top text-muted">{row.masters}</td>
                  <td className="px-3 py-2 align-top text-muted">{row.doctoral}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 rounded-lg bg-canvas px-4 py-3.5 ring-1 ring-hairline">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Do NOT need apostille or consular confirmation</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
          <span className="font-medium">Forms:</span> {data.documentsNotRequiringAuthentication.forms.join(", ")}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink">
          <span className="font-medium">Other optional documents:</span> {data.documentsNotRequiringAuthentication.otherOptional.join(", ")}
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        {data.sources.map((s) => (
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
    </div>
  );
}
