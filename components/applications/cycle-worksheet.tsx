"use client";
import { useState } from "react";
import { LocalWorksheet } from "@/components/applications/local-worksheet";
import { type WorksheetGroup } from "@/lib/applications/worksheets";

export function CycleWorksheet({ accountId, scope, groups, title, description, wordCounts = false }: {
  accountId: string | null; scope: string; groups: WorksheetGroup[]; title: string; description: string; wordCounts?: boolean;
}) {
  const [cycle, setCycle] = useState("");
  return <div className="space-y-3">
    {accountId && <label className="block max-w-xs text-[12px] font-medium text-ink">Intended application cycle (year)
      <input className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-[13px]" value={cycle} inputMode="numeric" maxLength={4} placeholder="e.g. 2027" onChange={e => setCycle(e.target.value)} />
    </label>}
    {accountId && !/^20\d{2}$/.test(cycle)
      ? <p className="text-[13px] text-muted">Enter the four-digit cycle to open a separate worksheet. Save before changing cycle or application configuration.</p>
      : <LocalWorksheet key={JSON.stringify([accountId, scope, cycle])} accountId={accountId} scope={JSON.stringify([scope, cycle])} groups={groups} title={title} description={description} wordCounts={wordCounts} />}
  </div>;
}
