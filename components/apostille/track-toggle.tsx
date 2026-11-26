"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { GeneralDefaultSection } from "./general-default-section";
import { CountryOverrideCard } from "./country-override-card";
import { EditionNotice } from "@/components/official-guidelines/edition-notice";
import { APOSTILLE_GENERAL_DEFAULT, APOSTILLE_COUNTRY_OVERRIDES } from "@/lib/apostille-requirements";
import { GUIDELINE_EDITIONS, editionMatches } from "@/lib/gks/guideline-editions";
import { TRACK_LABELS, type Track } from "@/lib/constants";

export function ApostilleTrackToggle({ defaultTrack, intake, allowToggle = false }: {
  defaultTrack: Track; intake: string | null; allowToggle?: boolean;
}) {
  const [track, setTrack] = useState<Track>(defaultTrack);
  const program = track === "gks_u" ? "GKS-U" : "GKS-G";
  const target = track === defaultTrack ? intake : null;
  const sourceCycle = GUIDELINE_EDITIONS[program].cycle;
  const matched = editionMatches(program, target);
  const relevant = APOSTILLE_COUNTRY_OVERRIDES.filter(item => Boolean(item.verifiedCycleByTrack[track]));
  const exact = target ? relevant.filter(item => item.verifiedCycleByTrack[track] === target) : [];
  const archive = relevant.filter(item => !exact.includes(item));
  return <div>
    {allowToggle && <div className="mt-4 flex gap-1.5">
      {(["gks_g", "gks_u"] as const).map(t => <button key={t} type="button" onClick={() => setTrack(t)}
        className={cn("rounded-full border px-4 py-1.5 text-[13px] font-semibold", track === t ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted")}>{TRACK_LABELS[t]}</button>)}
    </div>}
    <EditionNotice program={program} target={target} />
    {matched ? <GeneralDefaultSection data={APOSTILLE_GENERAL_DEFAULT[track]} /> :
      <details className="mt-4 rounded-xl border border-hairline bg-white p-4">
        <summary className="cursor-pointer text-[13px] font-semibold text-ink">Open {program} {sourceCycle} reference table (not verified for your intake)</summary>
        <GeneralDefaultSection data={APOSTILLE_GENERAL_DEFAULT[track]} />
      </details>}
    <h2 className="mt-8 text-[16px] font-semibold text-ink">Country-specific embassy notices</h2>
    <p className="mt-1 text-[13px] leading-relaxed text-muted">{target ? "Intake: " + target + ". " : "No intake established for this program. "}Only exact-cycle notices are shown as matching; verify the issuing embassy before authentication.</p>
    {exact.length ? <div className="mt-4 space-y-4">{exact.map(item => <CountryOverrideCard key={item.country} data={item} track={track} expectedCycle={target!} />)}</div> :
      <p className="mt-4 rounded-xl bg-canvas p-3 text-[13px] text-muted">No country-specific override verified for this intake in KMate.</p>}
    {archive.length > 0 && <details className="mt-4 rounded-xl border border-hairline bg-white p-4">
      <summary className="cursor-pointer text-[13px] font-semibold text-ink">Other-cycle notices · reference only</summary>
      <div className="mt-3 space-y-3">{archive.map(item => <CountryOverrideCard key={item.country} data={item} track={track} expectedCycle={target ?? "unknown"} />)}</div>
    </details>}
  </div>;
}
