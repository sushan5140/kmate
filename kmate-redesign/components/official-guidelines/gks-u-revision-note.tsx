"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { GKS_U_REVISION_NOTE } from "@/lib/official-guidelines";

export function GksURevisionNote() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="mt-4 bg-canvas">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left text-[13px] font-semibold text-primary"
      >
        See what changed
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-muted">{GKS_U_REVISION_NOTE.summary}</p>

          <div className="overflow-x-auto rounded-lg ring-1 ring-hairline">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-hairline bg-surface">
                  <th className="px-3 py-2 font-semibold text-ink">Page</th>
                  <th className="px-3 py-2 font-semibold text-ink">What changed</th>
                </tr>
              </thead>
              <tbody>
                {GKS_U_REVISION_NOTE.differences.map((d) => (
                  <tr key={d.page} className="border-b border-hairline bg-surface last:border-0">
                    <td className="px-3 py-2 align-top font-medium text-ink">{d.page}</td>
                    <td className="px-3 py-2 align-top text-muted">{d.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[12.5px] leading-relaxed text-muted">{GKS_U_REVISION_NOTE.closingNote}</p>
        </div>
      )}
    </Card>
  );
}
