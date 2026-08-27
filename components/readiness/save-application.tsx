"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Check, Save } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  SAVED_APPLICATIONS_STORAGE_KEY,
  parseSavedApplicationStore,
} from "@/lib/applications/storage";
import { createEmptyStore, upsertApplication } from "@/lib/applications/model";
import { savedApplicationFromReadiness } from "@/lib/applications/readiness-adapter";
import type { SavedApplication } from "@/lib/applications/schema";

/**
 * Saves the readiness configuration currently on screen as the applicant's
 * GKS application, so the home dashboard can summarise it.
 *
 * What is saved is the configuration only -- program, track, program type, the
 * chosen universities in order, and each one's department. Document progress is
 * deliberately NOT copied in: it stays under the readiness key it already
 * lives in, and the dashboard reads it from there. One progress store, not two
 * that can drift apart.
 */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
function emit() {
  for (const l of listeners) l();
}
function readRaw(): string | null {
  try {
    return window.localStorage.getItem(SAVED_APPLICATIONS_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The comparison that decides between "Saved" and "Update saved application". */
function sameConfiguration(
  app: SavedApplication,
  next: { program: string; track: string; subtype: string; universities: { name: string; major: string }[] }
): boolean {
  if (app.program !== next.program || app.track !== next.track) return false;
  if ((app.subtype ?? "") !== next.subtype) return false;
  if (app.universities.length !== next.universities.length) return false;
  return app.universities.every(
    (u, i) => u.name === next.universities[i].name && (u.major ?? "") === (next.universities[i].major ?? "")
  );
}

export function SaveApplication({
  program,
  track,
  subtype,
  universities,
}: {
  program: string;
  track: string;
  subtype: string;
  universities: { name: string; major: string }[];
}) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const store = useMemo(() => parseSavedApplicationStore(raw), [raw]);
  const active = useMemo(
    () =>
      store.applications.find((a) => a.id === store.activeApplicationId && a.status === "active") ??
      store.applications.find((a) => a.status === "active") ??
      null,
    [store]
  );

  // Only a route the saved-application model can represent is offerable.
  const savable = (program === "GKS-U" || program === "GKS-G") && (track === "embassy" || track === "university");
  if (!savable) return null;

  const config = { program, track, subtype, universities };
  const isSaved = active !== null && sameConfiguration(active, config);

  function save() {
    const next = savedApplicationFromReadiness({
      // Reusing the existing application's id turns this into an update rather
      // than a second saved application, and keeps its original createdAt.
      ...(active ? { id: active.id, createdAt: active.createdAt } : {}),
      program: program as "GKS-U" | "GKS-G",
      track: track as "embassy" | "university",
      subtype,
      universities,
    });
    try {
      window.localStorage.setItem(
        SAVED_APPLICATIONS_STORAGE_KEY,
        JSON.stringify(upsertApplication(store ?? createEmptyStore(), next))
      );
    } catch {
      /* not remembered, but the page keeps working */
    }
    emit();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={save}
        disabled={isSaved}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150",
          isSaved
            ? "cursor-default bg-success-soft text-success"
            : "bg-white text-ink ring-1 ring-hairline-strong hover:bg-canvas active:scale-[0.97]"
        )}
      >
        {isSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        {isSaved ? "Saved" : active ? "Update saved application" : "Save application"}
      </button>
      {!isSaved && active && (
        <span className="text-[11.5px] text-muted">Your dashboard still shows the previously saved version.</span>
      )}
    </div>
  );
}
