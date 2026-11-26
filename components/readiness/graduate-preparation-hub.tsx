"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  graduatePreparationGroups,
  graduatePreparationCount,
  parseGraduatePreparationProgress,
  HISTORICAL_GUIDELINES_URL,
  OFFICIAL_NOTICES_URL,
  type PreparationTrack,
} from "@/lib/readiness/graduate-preparation";

const EVENT = "kmate:graduate-preparation-changed";
const PREFIX = "kmate:graduate-preparation:2027:v1:";

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(EVENT, notify);
  };
}

function readProgress(key: string | null) {
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function GraduatePreparationHub({ track, accountId }: {
  track: PreparationTrack;
  accountId: string | null;
}) {
  const storageKey = accountId ? PREFIX + accountId : null;
  const raw = useSyncExternalStore(subscribe, () => readProgress(storageKey), () => null);
  const [fallback, setFallback] = useState<string[] | null>(null);
  const [storageError, setStorageError] = useState(false);
  const completed = fallback ?? parseGraduatePreparationProgress(raw);
  const groups = graduatePreparationGroups(track);
  const { done, total } = graduatePreparationCount(groups, completed);

  function writeProgress(next: string[]) {
    if (!storageKey) return;
    try {
      if (next.length) window.localStorage.setItem(storageKey, JSON.stringify(next));
      else window.localStorage.removeItem(storageKey);
      setFallback(null);
      setStorageError(false);
      window.dispatchEvent(new Event(EVENT));
    } catch {
      setFallback(next);
      setStorageError(true);
    }
  }

  function toggle(id: string) {
    if (!storageKey) return;
    writeProgress(completed.includes(id) ? completed.filter(item => item !== id) : [...completed, id]);
  }

  return (
    <section id="graduate-preparation" aria-labelledby="graduate-preparation-heading" className="mt-8 scroll-mt-6 rounded-2xl border border-hairline bg-white p-4 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Graduate pre-cycle planning</p>
      <h2 id="graduate-preparation-heading" className="mt-1 text-[20px] font-semibold tracking-tight text-ink">GKS-G 2027 Preparation Hub</h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
        Make progress before the application opens. These are suggested preparation tasks, not official requirements or deadlines.
        They do not change your saved application or document readiness score.
      </p>
      <div className="mt-4 rounded-xl bg-canvas p-3.5 text-[12.5px] leading-relaxed text-ink">
        <p className="font-semibold">Cycle status · checked 26 November 2026</p>
        <p className="mt-1">
          The general 2027 GKS-G guidelines were not located in the official notices at that check.
          The 2026 guidelines and older university records are historical reference only, including the graduate document checklist below.
          Confirm the current cycle before relying on any form, requirement, eligibility rule or deadline.
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          <a href={HISTORICAL_GUIDELINES_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline underline-offset-2">2026 guidelines (historical)</a>
          <a href={OFFICIAL_NOTICES_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline underline-offset-2">Check current official notices</a>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-ink">
          {track === "embassy" ? "Embassy Track preparation" : track === "university" ? "University Track preparation" : "Route undecided · compare both tracks"}
        </p>
        {storageKey && <p role="status" className="text-[12.5px] font-medium text-muted">{done} of {total} preparation tasks done</p>}
      </div>
      {storageKey && (
        <progress aria-label="Preparation task progress" value={done} max={total} className="mt-2 h-2 w-full accent-primary" />
      )}
      <div className="mt-5 grid min-w-0 gap-3 lg:grid-cols-3">
        {groups.map(group => (
          <div key={group.title} className="min-w-0 rounded-xl border border-hairline p-3.5">
            <h3 className="text-[13px] font-semibold text-ink">{group.title}</h3>
            <ul className="mt-3 space-y-4">
              {group.tasks.map(task => (
                <li key={task.id} className="min-w-0">
                  <div className="flex items-start gap-2">
                    {storageKey && <input type="checkbox" id={"graduate-prep-" + task.id} checked={completed.includes(task.id)} onChange={() => toggle(task.id)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />}
                    <div className="min-w-0">
                      {storageKey ? <label htmlFor={"graduate-prep-" + task.id} className="block text-[13px] font-medium text-ink">{task.title}</label> : <p className="text-[13px] font-medium text-ink">{task.title}</p>}
                      <p className="mt-1 text-[12px] leading-relaxed text-muted">{task.description}</p>
                      {task.link && (task.link.href.startsWith("https://")
                        ? <a href={task.link.href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[12px] font-medium text-primary underline underline-offset-2">{task.link.label}</a>
                        : <Link href={task.link.href} className="mt-1 inline-block text-[12px] font-medium text-primary underline underline-offset-2">{task.link.label}</Link>)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {storageKey ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
          <p className="max-w-lg text-[11.5px] leading-relaxed text-muted">
            Only task completion is saved in this browser for your KMate account, not on the server. It may remain on a shared device after sign-out or profile reset; clear it here or in browser storage. This is not an eligibility score.
          </p>
          <button type="button" onClick={() => writeProgress([])} className="rounded-full px-3 py-2 text-[12px] font-medium text-ink ring-1 ring-hairline hover:bg-canvas">Clear preparation progress</button>
          {storageError && <p role="alert" className="w-full text-[12px] text-red-600">Browser storage is unavailable. Changes are temporary and stored progress could not be cleared or updated.</p>}
        </div>
      ) : (
        <p className="mt-4 text-[12px] leading-relaxed text-muted">Guest preview · read-only. <Link href="/login?next=%2Fapplication-readiness%3Fprogram%3DGKS-G%26own%3D1%23graduate-preparation" className="font-semibold text-primary underline underline-offset-2">Sign in</Link> to mark preparation tasks on this device.</p>
      )}
    </section>
  );
}
