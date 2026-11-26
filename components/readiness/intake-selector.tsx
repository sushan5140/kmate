"use client";
import { useState } from "react";
import { normalizeIntake, profileIntake } from "@/lib/gks/guideline-editions";
import { canSetProfileIntake } from "@/lib/readiness/intake";

export function IntakeSelector({ program, cycle, profileProgram, profileYear, years, guest, onSelect, pending }: {
  program: string; cycle: string | null; profileProgram: string; profileYear: number | null;
  years: string[]; guest: boolean; onSelect: (year: string) => void; pending: boolean;
}) {
  const [choice, setChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const profileCycle = profileIntake(program, profileProgram, profileYear);
  const allowed = canSetProfileIntake(program, profileProgram === "GKS-U" ? "gks_u" : profileProgram === "GKS-G" ? "gks_g" : null, Number(choice), profileYear);
  async function saveDefault() {
    if (!choice || !allowed || guest || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/profile/application-year", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program, year: Number(choice), expectedYear: profileYear, makeDefault: true }),
      });
      const data = await response.json();
      if (!response.ok || data.applicationYear !== Number(choice)) {
        setError(response.status === 409 ? "Your profile changed. Refresh the page before saving a new default." : "Could not save the profile default. You can still use this year for this application only.");
        return;
      }
      onSelect(choice); setChoice("");
    } catch { setError("Could not save the profile default. Your existing default has not been confirmed as changed."); }
    finally { setSaving(false); }
  }
  if (!program) return <p className="text-[12px] text-muted">Choose a GKS programme first.</p>;
  return <div className="space-y-2">
    <label htmlFor="readiness-intake" className="text-[12px] font-medium text-ink">Intake year</label>
    <select id="readiness-intake" value={choice || cycle || ""} disabled={saving || pending}
      onChange={e => { const year = normalizeIntake(e.target.value); setError(""); if (!year || year === cycle) { setChoice(""); return; } if (year === profileCycle || guest) { onSelect(year); setChoice(""); } else setChoice(year); }}
      className="block w-full max-w-xs rounded-xl border border-border bg-white px-3 py-2 text-[13.5px] text-ink">
      <option value="" disabled>Choose intake year</option>
      {years.map(year => <option key={year} value={year}>{year}{year === profileCycle ? " (profile default)" : ""}</option>)}
    </select>
    <p className="text-[12px] text-muted">{cycle ? "Viewing " + cycle + (cycle === profileCycle ? " · profile default" : " · application-specific selection") : "No intake selected."} Intake year does not establish application availability.</p>
    {choice && <div className="rounded-xl border border-hairline bg-canvas p-3 space-y-2">
      <p className="text-[13px] font-semibold text-ink">Make {choice} your default intake year?</p>
      <p className="text-[12px] text-muted">{allowed ? "Saving updates only the intake year on your profile. Your other profile information is unchanged." : "This programme or year cannot replace your profile default. You can still use it for this application."}</p>
      <div className="flex flex-wrap gap-2">
        {allowed && <button type="button" disabled={saving} onClick={saveDefault} className="rounded-full bg-primary px-3 py-2 text-[12px] font-semibold text-white">{saving ? "Saving…" : "Yes, make default"}</button>}
        <button type="button" disabled={saving} onClick={() => { onSelect(choice); setChoice(""); setError(""); }} className="rounded-full border border-hairline bg-white px-3 py-2 text-[12px] font-medium text-ink">Use for this application only</button>
        <button type="button" disabled={saving} onClick={() => { setChoice(""); setError(""); }} className="px-2 py-2 text-[12px] text-muted">Cancel</button>
      </div>
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    </div>}
    {guest && <p className="text-[12px] text-muted">Guest preview: changing the year does not update any profile.</p>}
  </div>;
}
