"use client";
import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { countWords, parseWorksheet, validateWorksheet, REVIEW_OPTIONS, type WorksheetGroup, type WorksheetValues } from "@/lib/applications/worksheets";

const fieldClass = "mt-1 w-full min-w-0 rounded-lg border border-hairline bg-white px-3 py-2 text-[13px] text-ink";
const actionClass = "rounded-full px-4 py-2 text-[13px] font-medium text-ink ring-1 ring-hairline hover:bg-canvas";

export function LocalWorksheet({ accountId, scope, groups, title, description, wordCounts = false }: {
  accountId: string | null; scope: string; groups: WorksheetGroup[]; title: string; description: string; wordCounts?: boolean;
}) {
  const key = accountId ? "kmate:worksheet:v1:" + JSON.stringify([accountId, scope]) : null;
  // Explicit load avoids hydration mismatch and never writes during rendering.
  const [loaded, setLoaded] = useState(false);
  const [values, setValues] = useState<WorksheetValues>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  function load() {
    if (!key) return;
    try {
      setValues(parseWorksheet(groups, window.localStorage.getItem(key)));
      setLoaded(true); setError(""); setMessage("");
    } catch { setError("Browser storage unavailable. No records loaded."); }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!key || !loaded) return;
    const issue = validateWorksheet(groups, values);
    if (issue) { setError(issue); setMessage(""); return; }
    try {
      window.localStorage.setItem(key, JSON.stringify(values));
      setError(""); setMessage("Saved in this browser.");
    } catch { setError("Save failed. Your changes remain unsaved."); setMessage(""); }
  }
  function clear() {
    if (!key) return;
    try {
      window.localStorage.removeItem(key);
      setValues({}); setConfirm(false); setError(""); setMessage("Local worksheet cleared.");
    } catch { setError("Unable to clear browser storage."); }
  }
  return (
    <Card className="flex min-w-0 flex-col gap-4">
      <div><h2 className="text-[17px] font-semibold text-ink">{title}</h2><p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p></div>
      <p className="rounded-xl bg-canvas p-3 text-[12px] leading-relaxed text-muted">User-entered notes only. No automatic verification, AI generation or uploads. Records are saved locally under your account, not encrypted or synced, and may remain after sign-out or profile reset. Do not include sensitive identifiers or private documents. Clear the worksheet or browser site storage to remove the local copy.</p>
      {!key ? <p className="text-[13px] text-muted">Guest preview · read-only. Sign in to save your own worksheet.</p> :
        !loaded ? <div><button type="button" className={actionClass} onClick={load}>Open my worksheet</button></div> : null}
      {(!key || loaded) && <form onSubmit={save} className="space-y-4">
        {groups.map(group => <fieldset key={group.title} className="min-w-0 space-y-3 rounded-xl border border-hairline p-3.5">
          <legend className="px-1 text-[13px] font-semibold text-ink">{group.title}</legend>
          {group.fields.map(f => <label key={f.id} className="block min-w-0 text-[13px] font-medium text-ink">
            {f.label}
            <span className="mt-0.5 block text-[12px] font-normal leading-relaxed text-muted">{f.hint}</span>
            {f.kind === "review" ? <select disabled={!key} className={fieldClass} value={values[f.id] ?? ""} onChange={e => { setValues(v => ({...v, [f.id]: e.target.value})); setMessage(""); }}>{REVIEW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> :
              f.kind === "textarea" ? <textarea disabled={!key} className={fieldClass} rows={4} maxLength={f.max ?? 500} value={values[f.id] ?? ""} onChange={e => { setValues(v => ({...v, [f.id]: e.target.value})); setMessage(""); }} /> :
              <input disabled={!key} className={fieldClass} type={f.kind === "url" ? "url" : f.kind === "date" ? "date" : "text"} maxLength={f.max ?? 500} value={values[f.id] ?? ""} onChange={e => { setValues(v => ({...v, [f.id]: e.target.value})); setMessage(""); }} />}
            {wordCounts && f.kind === "textarea" && <span className="block text-[11px] font-normal text-muted">{countWords(values[f.id] ?? "")} words · planning count, not an official limit</span>}
          </label>)}
        </fieldset>)}
        {key && <div className="flex flex-wrap gap-2">
          <button type="submit" className="rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-white">Save worksheet</button>
          {confirm ? <><button type="button" className={actionClass} onClick={clear}>Confirm clear worksheet</button><button type="button" className={actionClass} onClick={() => setConfirm(false)}>Cancel</button></> : <button type="button" className={actionClass} onClick={() => setConfirm(true)}>Clear worksheet</button>}
        </div>}
      </form>}
      {error && <p role="alert" className="text-[13px] text-red-700">{error}</p>}
      {message && <p role="status" className="text-[13px] text-muted">{message}</p>}
    </Card>
  );
}
