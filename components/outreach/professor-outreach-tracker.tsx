"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import {
  EMPTY_OUTREACH_DRAFT, MAX_OUTREACH_RECORDS, OUTREACH_LABELS, OUTREACH_STATUSES,
  filterOutreachRecords, isFollowUpDue, localOutreachDate, parseOutreachRecords,
  removeOutreachRecord, upsertOutreachRecord, validateOutreachDraft,
  type OutreachDraft, type OutreachRecord, type OutreachStatus,
} from "@/lib/outreach/model";

const EVENT = "kmate:professor-outreach-changed";
const PREFIX = "kmate:professor-outreach:v1:";
const field = "mt-1 w-full min-w-0 rounded-lg border border-hairline bg-white px-3 py-2 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-primary";
const primary = "rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90";
const secondary = "rounded-full px-4 py-2 text-[13px] font-semibold text-ink ring-1 ring-hairline hover:bg-canvas";

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(EVENT, notify);
  };
}
function readStorage(key: string | null) {
  if (!key) return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function DraftField({ label, value, onChange, maxLength, required, type = "text" }: {
  label: string; value: string; onChange: (value: string) => void; maxLength?: number; required?: boolean; type?: string;
}) {
  return <label className="block min-w-0 text-[12px] font-medium text-ink">{label}
    <input type={type} value={value} onChange={event => onChange(event.target.value)} maxLength={maxLength} required={required} className={field} />
  </label>;
}
export function ProfessorOutreachTracker({ accountId }: { accountId: string | null }) {
  const storageKey = accountId ? PREFIX + accountId : null;
  const raw = useSyncExternalStore(subscribe, () => readStorage(storageKey), () => null);
  const today = useSyncExternalStore(subscribe, () => localOutreachDate(new Date()), () => "");
  const [draft, setDraft] = useState<OutreachDraft>(EMPTY_OUTREACH_DRAFT);
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "due" | OutreachStatus>("all");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const records = parseOutreachRecords(raw);
  const visible = filterOutreachRecords(records, query, status, today);
  const due = records.filter(record => isFollowUpDue(record, today)).length;

  function update<K extends keyof OutreachDraft>(key: K, value: OutreachDraft[K]) {
    setDraft(old => ({ ...old, [key]: value }));
  }
  function save(recordsToSave: OutreachRecord[]): boolean {
    if (!storageKey) return false;
    try {
      if (recordsToSave.length) window.localStorage.setItem(storageKey, JSON.stringify(recordsToSave));
      else window.localStorage.removeItem(storageKey);
      window.dispatchEvent(new Event(EVENT));
      setError("");
      return true;
    } catch {
      setError("Browser storage is unavailable. Nothing was saved or removed. Try again on this device.");
      return false;
    }
  }
  function resetDraft() {
    setDraft(EMPTY_OUTREACH_DRAFT);
    setEditing(null);
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!storageKey) return;
    const result = validateOutreachDraft(draft);
    if (result.error !== null) { setError(result.error); return; }
    const latest = parseOutreachRecords(readStorage(storageKey));
    if (editing && !latest.some(record => record.id === editing)) { setError("This record no longer exists. Cancel editing and try again."); return; }
    if (!editing && latest.length >= MAX_OUTREACH_RECORDS) { setError("Tracker limit reached. Remove an old record before adding another."); return; }
    const record = { ...result.draft, id: editing ?? crypto.randomUUID() };
    if (save(upsertOutreachRecord(latest, record))) {
      setMessage(editing ? "Record updated." : "Record added.");
      resetDraft();
    }
  }
  function edit(record: OutreachRecord) {
    const { id, ...fields } = record;
    setEditing(id); setDraft(fields); setError(""); setMessage("");
    document.getElementById("outreach-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function remove(id: string) {
    const latest = parseOutreachRecords(readStorage(storageKey));
    if (save(removeOutreachRecord(latest, id))) {
      if (editing === id) resetDraft();
      setConfirmDelete(null); setMessage("Record removed.");
    }
  }
  if (!storageKey) return (
    <section className="mt-5 rounded-2xl border border-hairline bg-white p-5">
      <h2 className="text-[17px] font-semibold text-ink">Guest preview · read-only</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">Research professors, keep track of your own contact attempts, and plan follow-ups. Sign in to create and edit private browser-local records. No sample professor is presented as a real listing.</p>
      <div className="mt-4 flex flex-wrap gap-2">{OUTREACH_STATUSES.map(stage => <span key={stage} className="rounded-full bg-canvas px-3 py-1.5 text-[12px] text-ink">{OUTREACH_LABELS[stage]}</span>)}</div>
      <Link href="/login?next=%2Fprofessor-outreach" className="mt-5 inline-block text-[13px] font-semibold text-primary underline underline-offset-2">Sign in to use tracker</Link>
    </section>
  );

  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[["Tracked", records.length], ["Awaiting reply", records.filter(record => record.status === "contacted").length], ["Follow-up due", due]].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl border border-hairline bg-white p-3 sm:p-4">
            <p className="text-[12px] leading-tight text-muted">{label}</p><p className="mt-1 text-[23px] font-semibold tabular-nums text-ink">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-canvas p-3.5 text-[12px] leading-relaxed text-muted">
        Records are manually entered, unverified and stored only in this browser for your KMate account. They are not encrypted or synced across devices, and may remain after sign-out or profile reset. Avoid sensitive contact details and private correspondence. Clear your records here before using a shared device. No emails are sent and no reminders run in the background.
      </div>
      <form id="outreach-form" onSubmit={onSubmit} className="scroll-mt-6 rounded-2xl border border-hairline bg-white p-4 sm:p-5">
        <h2 className="text-[17px] font-semibold text-ink">{editing ? "Edit outreach record" : "Add professor or lab"}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <DraftField label="Professor or lab name *" value={draft.professor} onChange={value => update("professor", value)} maxLength={120} required />
          <DraftField label="University *" value={draft.university} onChange={value => update("university", value)} maxLength={160} required />
          <DraftField label="Department" value={draft.department} onChange={value => update("department", value)} maxLength={160} />
          <DraftField label="Official faculty or lab URL (HTTPS)" value={draft.officialUrl} onChange={value => update("officialUrl", value)} maxLength={500} type="url" />
          <label className="block text-[12px] font-medium text-ink">Stage<select value={draft.status} onChange={event => update("status", event.target.value as OutreachStatus)} className={field}>{OUTREACH_STATUSES.map(stage => <option key={stage} value={stage}>{OUTREACH_LABELS[stage]}</option>)}</select></label>
          <DraftField label="Last contact date" type="date" value={draft.contactedOn} onChange={value => update("contactedOn", value)} />
          <DraftField label="Planned follow-up date" type="date" value={draft.followUpOn} onChange={value => update("followUpOn", value)} />
          <label className="block text-[12px] font-medium text-ink sm:col-span-2">Research fit<textarea className={field} rows={2} maxLength={500} value={draft.researchFit} onChange={event => update("researchFit", event.target.value)} /></label>
          <label className="block text-[12px] font-medium text-ink sm:col-span-2">Notes (avoid sensitive information)<textarea className={field} rows={3} maxLength={1000} value={draft.notes} onChange={event => update("notes", event.target.value)} /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={primary} type="submit">{editing ? "Save changes" : "Add record"}</button>
          {editing && <button type="button" className={secondary} onClick={() => { resetDraft(); setError(""); }}>Cancel edit</button>}
        </div>
      </form>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
      {message && <p role="status" className="text-[13px] text-muted">{message}</p>}
      <section className="rounded-2xl border border-hairline bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[17px] font-semibold text-ink">Your outreach records</h2>
          <span className="text-[12px] text-muted">{records.length} / {MAX_OUTREACH_RECORDS}</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <DraftField label="Search records" value={query} onChange={setQuery} />
          <label className="block text-[12px] font-medium text-ink">Filter stage<select value={status} onChange={event => setStatus(event.target.value as typeof status)} className={field}><option value="all">All stages</option><option value="due">Follow-up due</option>{OUTREACH_STATUSES.map(stage => <option key={stage} value={stage}>{OUTREACH_LABELS[stage]}</option>)}</select></label>
        </div>
        {visible.length === 0 ? <p className="mt-4 rounded-xl bg-canvas p-4 text-[13px] text-muted">{records.length ? "No matching records." : "No records yet. Add a professor or lab you are researching."}</p> : (
          <div className="mt-4 space-y-3">
            {visible.map(record => (
              <article key={record.id} className="min-w-0 rounded-xl border border-hairline p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 break-words">
                    <h3 className="text-[15px] font-semibold text-ink">{record.professor}</h3>
                    <p className="text-[12.5px] text-muted">{record.university}{record.department ? " · " + record.department : ""}</p>
                  </div>
                  <span className="rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink">{OUTREACH_LABELS[record.status]}</span>
                </div>
                {record.researchFit && <p className="mt-2 whitespace-pre-wrap break-words text-[13px] text-ink">{record.researchFit}</p>}
                {record.officialUrl && <a href={record.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block break-all text-[12px] font-medium text-primary underline">User-provided faculty link</a>}
                <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-muted">
                  {record.contactedOn && <span>Contacted: {record.contactedOn}</span>}
                  {record.followUpOn && <span className={isFollowUpDue(record, today) ? "font-semibold text-amber-700" : ""}>Follow-up: {record.followUpOn}{isFollowUpDue(record, today) ? " · due" : ""}</span>}
                </div>
                {record.notes && <p className="mt-2 whitespace-pre-wrap break-words text-[12.5px] text-muted">{record.notes}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => edit(record)} className={secondary}>Edit</button>
                  {confirmDelete === record.id ? <><button type="button" onClick={() => remove(record.id)} className={secondary}>Confirm removal</button><button type="button" onClick={() => setConfirmDelete(null)} className={secondary}>Cancel</button></> : <button type="button" onClick={() => setConfirmDelete(record.id)} className={secondary}>Remove</button>}
                </div>
              </article>
            ))}
          </div>
        )}
        {records.length > 0 && <div className="mt-4 border-t border-hairline pt-4">
          {confirmClear ? <div className="flex flex-wrap items-center gap-2"><p className="w-full text-[12px] text-muted">Permanently remove all outreach records from this browser for this account?</p><button type="button" className={secondary} onClick={() => { if (save([])) { resetDraft(); setConfirmClear(false); setConfirmDelete(null); setMessage("Outreach records cleared."); } }}>Confirm clear all</button><button type="button" className={secondary} onClick={() => setConfirmClear(false)}>Cancel</button></div> : <button type="button" className={secondary} onClick={() => setConfirmClear(true)}>Clear all outreach records</button>}
        </div>}
      </section>
    </div>
  );
}
