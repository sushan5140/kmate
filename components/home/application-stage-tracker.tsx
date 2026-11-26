"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import type { SavedApplication } from "@/lib/applications/schema";
import {
  EMPTY_STAGE, MAX_STAGE_ENTRIES, STAGE_LABELS, clearStageScope, parseStageEntries,
  stageEntryFor, stageScope, stageStatusesFor, stageTargets, upsertStageEntry, validStageCycle,
  type StageEntry, type StageStatus, type StageTarget,
} from "@/lib/applications/stage-tracker";

const PREFIX = "kmate:application-stages:v1:";
const EVENT = "kmate:application-stages-changed";
const field = "mt-1 w-full min-w-0 rounded-lg border border-hairline bg-white px-2.5 py-2 text-[13px] text-ink";
const button = "rounded-full px-3 py-2 text-[12px] font-medium text-ink ring-1 ring-hairline hover:bg-canvas";

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(EVENT, notify);
  };
}
function read(key: string | null) {
  if (!key) return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function StageEditor({ target, entry, onSave }: {
  target: StageTarget; entry?: StageEntry;
  onSave: (data: Pick<StageEntry, "status" | "eventDate" | "nextCheck">) => void;
}) {
  const [status, setStatus] = useState<StageStatus>(entry?.status ?? EMPTY_STAGE.status);
  const [eventDate, setEventDate] = useState(entry?.eventDate ?? "");
  const [nextCheck, setNextCheck] = useState(entry?.nextCheck ?? "");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ status, eventDate, nextCheck });
  }
  return (
    <form onSubmit={submit} className="min-w-0 rounded-xl border border-hairline p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="min-w-0 break-words text-[14px] font-semibold text-ink">{target.label}</h3>
        <span className="rounded-full bg-canvas px-2.5 py-1 text-[11px] text-muted">{entry ? STAGE_LABELS[entry.status] : "Not recorded"}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block min-w-0 text-[12px] font-medium text-ink">Self-reported stage
          <select className={field} value={status} onChange={e => setStatus(e.target.value as StageStatus)}>
            {stageStatusesFor(target).map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="block min-w-0 text-[12px] font-medium text-ink">Stage date (optional)
          <input className={field} type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
        </label>
        <label className="block min-w-0 text-[12px] font-medium text-ink">Personal next-check date
          <input className={field} type="date" value={nextCheck} onChange={e => setNextCheck(e.target.value)} />
        </label>
      </div>
      <button type="submit" className={button + " mt-3"}>Save stage</button>
    </form>
  );
}

export function ApplicationStageTracker({ app, accountId, profileCycle }: {
  app: SavedApplication; accountId: string | null; profileCycle: string | null;
}) {
  const key = accountId ? PREFIX + accountId : null;
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const [cycle, setCycle] = useState(profileCycle && validStageCycle(profileCycle) ? profileCycle : "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState<"scope" | "all" | null>(null);
  const entries = parseStageEntries(raw);
  const scope = stageScope(app, cycle);
  const targets = stageTargets(app);
  const currentCount = scope ? targets.filter(target => stageEntryFor(entries, scope, target)).length : 0;

  function write(next: StageEntry[]): boolean {
    if (!key) return false;
    try {
      if (next.length) window.localStorage.setItem(key, JSON.stringify(next));
      else window.localStorage.removeItem(key);
      window.dispatchEvent(new Event(EVENT));
      setError("");
      return true;
    } catch {
      setError("Browser storage is unavailable. No change was confirmed.");
      return false;
    }
  }
  function save(target: StageTarget, values: Pick<StageEntry, "status" | "eventDate" | "nextCheck">) {
    if (!key || !scope || !stageStatusesFor(target).includes(values.status)) return;
    setMessage("");
    const next = upsertStageEntry(parseStageEntries(read(key)), { scope, targetId: target.id, ...values });
    if (!next) { setError("Invalid date or local record limit reached. Clear old records before adding more."); return; }
    if (write(next)) setMessage("Self-reported stage saved.");
  }
  function clear() {
    if (!key || !confirmClear) return;
    const latest = parseStageEntries(read(key));
    const next = confirmClear === "all" ? [] : scope ? clearStageScope(latest, scope) : latest;
    if (write(next)) {
      setConfirmClear(null);
      setMessage("Local stage records cleared.");
    }
  }
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-[16px] font-semibold text-ink">Application stage tracker</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Track submission, receipt, interviews and outcomes from notices you actually receive. These are self-reported records, not verified results, official deadlines, or a universal sequence of GKS rounds.
        </p>
      </div>
      {!key ? (
        <p className="rounded-xl bg-canvas p-3 text-[12.5px] text-muted">Guest preview · read-only. Sign in to record your own stages.</p>
      ) : (
        <>
          <div className="rounded-xl bg-canvas p-3 text-[12px] leading-relaxed text-muted">
            Stage records are stored only in this browser for your KMate account. They are not encrypted or shared with other applicants. They may remain after sign-out or profile reset. No external portal is accessed and no background notifications are sent. Clear records before sharing this device.
          </div>
          <label className="block max-w-xs text-[12px] font-medium text-ink">Application cycle (year)
            <input className={field} type="text" inputMode="numeric" maxLength={4} placeholder={profileCycle && validStageCycle(profileCycle) ? profileCycle : "e.g. 2027"} value={cycle} onChange={event => { setCycle(event.target.value); setConfirmClear(null); setMessage(""); setError(""); }} />
          </label>
          <p className="text-[12px] leading-relaxed text-muted">Enter the cycle explicitly. Changing the cycle, program, route or selected departments opens a separate set of records; it never transfers an old outcome to a new application.</p>
          {scope ? (
            <div className="space-y-3">
              <p className="text-[12px] font-medium text-muted">{currentCount} of {targets.length} recipients or review stages recorded · {cycle}</p>
              {app.universities.length === 0 && <p className="text-[12px] text-muted">Add universities in Application Readiness to track institution-specific stages.</p>}
              {targets.map(target => {
                const entry = stageEntryFor(entries, scope, target);
                return <StageEditor key={JSON.stringify([scope, target.id, entry ?? null])} target={target} entry={entry} onSave={values => save(target, values)} />;
              })}
            </div>
          ) : <p className="text-[13px] text-muted">Choose a four-digit application year to start tracking.</p>}
          {entries.length > 0 && <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
            {confirmClear ? <>
              <p className="w-full text-[12px] text-muted">{confirmClear === "all" ? "Remove every stage record for this account from this browser, including other cycles?" : "Remove stage records for this application and cycle?"}</p>
              <button type="button" className={button} onClick={clear}>Confirm clear</button>
              <button type="button" className={button} onClick={() => setConfirmClear(null)}>Cancel</button>
            </> : <>
              {currentCount > 0 && <button type="button" className={button} onClick={() => setConfirmClear("scope")}>Clear this cycle and application</button>}
              <button type="button" className={button} onClick={() => setConfirmClear("all")}>Clear all local stage records</button>
            </>}
          </div>}
          {error && <p role="alert" className="text-[12.5px] text-red-700">{error}</p>}
          {message && <p role="status" className="text-[12.5px] text-muted">{message}</p>}
          {entries.length >= MAX_STAGE_ENTRIES && <p className="text-[12px] text-muted">Local record limit reached.</p>}
        </>
      )}
    </Card>
  );
}
