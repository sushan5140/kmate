"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, FolderCheck, Info, MessageSquare, Megaphone } from "lucide-react";
import { Card, MicroLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  SAVED_APPLICATIONS_STORAGE_KEY,
  parseSavedApplicationStore,
} from "@/lib/applications/storage";
import { createEmptyStore, upsertApplication } from "@/lib/applications/model";
import { savedApplicationFromReadiness } from "@/lib/applications/readiness-adapter";
import { buildApplicationDashboardSummary } from "@/lib/applications/summary";
import type { DashboardReadinessSnapshot, ProgressState } from "@/lib/applications/summary";
import type { SavedApplication } from "@/lib/applications/schema";
import { STORAGE_PREFIX, parseProgress } from "@/lib/readiness/application";
import { DeadlineNoticeFeed } from "@/components/home/deadline-notice-feed";
import { deadlineNoticeDataset } from "@/lib/deadlines";
import type { PublishedGksNotice } from "@/lib/notices/published-schema";

/**
 * The saved GKS application, summarised on the home page.
 *
 * Two stores meet here and are deliberately kept apart. The saved application
 * -- which program, track and universities the applicant committed to -- lives
 * under kmate:saved-applications:v1. Their document progress stays where it
 * already was, under the readiness key, and is never copied into the saved
 * application. Readiness remains the single source of progress; this reads it
 * and adds nothing of its own, so the two can never disagree.
 *
 * The document rules themselves come from the server (they are a 338 KB
 * dataset), fetched for the saved configuration and merged with local progress
 * here.
 */

/* ------------------------------------------------------------------ *
 * localStorage, read the same hydration-safe way readiness does
 * ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
export function emitSavedApplicationsChanged() {
  for (const l of listeners) l();
}
function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export interface ProfileDefaults {
  program: string;
  track: string;
  subtype: string;
  major: string;
  universities: string[];
}

interface SnapshotItem {
  id: string;
  label: string;
  status: "required" | "conditional" | "optional" | "not_stated";
}
interface Snapshot {
  common: SnapshotItem[];
  universities: { name: string; major: string; items: SnapshotItem[] }[];
  unavailable: string[];
}

/** The readiness URL encoding, reused exactly -- there is no second format. */
export function readinessHref(app: SavedApplication): string {
  const p = new URLSearchParams();
  p.set("program", app.program);
  if (app.track) p.set("track", app.track);
  if (app.subtype) p.set("subtype", app.subtype);
  for (const u of app.universities) {
    p.append("uni", u.name);
    p.append("maj", u.major ?? "");
  }
  p.set("own", "1");
  return `/application-readiness?${p.toString()}`;
}

/** The Requirement Checker's own parameters, as far as that route supports. */
function requirementHref(app: SavedApplication, universityName: string, major?: string): string {
  const p = new URLSearchParams();
  p.set("program", app.program);
  if (app.track) p.set("track", app.track);
  if (app.subtype) p.set("subtype", app.subtype);
  p.set("university", universityName);
  if (major) p.set("major", major);
  p.set("check", "1");
  return `/requirement-checker?${p.toString()}`;
}

export function ApplicationDashboard({
  defaults,
  cycle,
  liveNotices,
}: {
  defaults: ProfileDefaults;
  /** The applicant's application year, so deadlines are matched to THEIR cycle. */
  cycle: string | null;
  /**
   * Every approved GKS notice, unfiltered. The saved application lives in
   * localStorage, so only the client knows which program and track to match
   * against -- the feed narrows this list itself.
   */
  liveNotices?: PublishedGksNotice[];
}) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(SAVED_APPLICATIONS_STORAGE_KEY),
    () => null
  );
  const store = useMemo(() => parseSavedApplicationStore(raw), [raw]);
  const app = useMemo(
    () =>
      store.applications.find((a) => a.id === store.activeApplicationId && a.status === "active") ??
      store.applications.find((a) => a.status === "active") ??
      null,
    [store]
  );

  const configKey = app ? `${app.program}|${app.track}|${app.subtype ?? ""}` : "";
  const progressRaw = useSyncExternalStore(
    subscribe,
    () => (app ? readRaw(STORAGE_PREFIX + configKey) : null),
    () => null
  );
  const progress = useMemo(() => parseProgress(progressRaw), [progressRaw]);

  // Keyed by the configuration it describes rather than cleared when the
  // application changes: a result for a different configuration is simply not
  // used, which avoids a synchronous setState inside the effect and makes a
  // late response for an old application impossible to display.
  const query = app ? readinessHref(app).split("?")[1] : "";
  const [fetched, setFetched] = useState<{ key: string; data: Snapshot | null } | null>(null);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    fetch("/api/readiness/snapshot?" + query)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Snapshot) => {
        if (!cancelled) setFetched({ key: query, data });
      })
      .catch(() => {
        // The rules could not be loaded. The application itself is still shown,
        // with its progress figures withheld rather than guessed at.
        if (!cancelled) setFetched({ key: query, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const current = fetched && fetched.key === query ? fetched : null;
  const snapshot = current?.data ?? null;
  const loadState: "loading" | "error" | "idle" = !current ? "loading" : current.data ? "idle" : "error";

  function saveApplication(next: SavedApplication) {
    try {
      window.localStorage.setItem(
        SAVED_APPLICATIONS_STORAGE_KEY,
        JSON.stringify(upsertApplication(store ?? createEmptyStore(), next))
      );
    } catch {
      /* nothing to do -- the application simply is not remembered */
    }
    emitSavedApplicationsChanged();
  }

  /* ---------------- empty state ---------------- */

  if (!app) {
    const canBootstrap = Boolean(defaults.program && defaults.track);
    return (
      <Card className="mt-8 flex flex-col gap-3">
        <MicroLabel>Your GKS application</MicroLabel>
        <p className="text-[13.5px] leading-relaxed text-muted">
          Save an application to track its documents from here. Nothing is saved until you choose to.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canBootstrap && (
            <button
              type="button"
              onClick={() =>
                saveApplication(
                  savedApplicationFromReadiness({
                    program: defaults.program as "GKS-U" | "GKS-G",
                    track: defaults.track as "embassy" | "university",
                    subtype: defaults.subtype,
                    universities: defaults.universities.map((name) => ({ name, major: defaults.major })),
                  })
                )
              }
              className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-[13.5px] font-medium text-white transition-all duration-150 hover:bg-ink/90 active:scale-[0.97]"
            >
              Create from my profile
            </button>
          )}
          <Link
            href="/application-readiness"
            className={cn(
              "inline-flex h-10 items-center rounded-full px-4 text-[13.5px] font-medium transition-all duration-150 active:scale-[0.97]",
              canBootstrap
                ? "bg-white text-ink ring-1 ring-hairline-strong hover:bg-canvas"
                : "bg-ink text-white hover:bg-ink/90"
            )}
          >
            Open Application Readiness
          </Link>
        </div>
        {canBootstrap && (
          <p className="text-[12px] leading-relaxed text-muted">
            Creating from your profile uses the program, track and universities already on it
            {defaults.universities.length ? ` (${defaults.universities.length} chosen)` : ""}. You can change any
            of it afterwards without touching your profile.
          </p>
        )}
      </Card>
    );
  }

  /* ---------------- saved application ---------------- */

  const withProgress = (items: SnapshotItem[], forUniversity?: string) =>
    items.map((i) => ({
      status: i.status,
      progress: ((forUniversity ? progress.byUniversity[forUniversity]?.[i.id] : progress.common[i.id]) ??
        "untracked") as ProgressState,
    }));

  const readiness: DashboardReadinessSnapshot | null = snapshot
    ? {
        common: withProgress(snapshot.common),
        universities: snapshot.universities.map((u) => ({
          name: u.name,
          major: u.major,
          items: withProgress(u.items, u.name),
        })),
      }
    : null;

  const summary = readiness ? buildApplicationDashboardSummary(app, readiness) : null;
  const routeLabel = [app.program, app.track === "embassy" ? "Embassy Track" : "University Track", app.subtype]
    .filter(Boolean)
    .join(" · ");

  const missingCommon = snapshot
    ? snapshot.common
        .filter((i) => i.status === "required" && progress.common[i.id] === "missing")
        .map((i) => i.label)
    : [];

  return (
    <div className="mt-8 flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <MicroLabel>My GKS application</MicroLabel>
            <p className="mt-1 text-[15px] font-semibold text-ink">{routeLabel}</p>
          </div>
          <Link
            href={readinessHref(app)}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-[13.5px] font-medium text-white transition-all duration-150 hover:bg-ink/90 active:scale-[0.97]"
          >
            Continue application
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loadState === "error" ? (
          <div className="flex items-start gap-2 rounded-xl bg-canvas px-3.5 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <p className="text-[12.5px] leading-relaxed text-muted">
              Verified requirement data currently unavailable, so checklist progress cannot be shown. Your saved
              application is unchanged.
            </p>
          </div>
        ) : summary ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <p className="text-[30px] font-semibold leading-none tracking-tight text-ink">
                {summary.overall.progressPercent === null ? "—" : `${summary.overall.progressPercent}%`}
              </p>
              <p className="text-[13px] text-muted">
                {summary.overall.requiredTotal === 0
                  ? "No required documents recorded for this application"
                  : `${summary.overall.requiredReady} / ${summary.overall.requiredTotal} required items ready`}
              </p>
            </div>
            <Bar ready={summary.overall.requiredReady} total={summary.overall.requiredTotal} label="Overall checklist progress" />
            <dl className="grid grid-cols-3 gap-x-4 gap-y-3 border-t border-hairline pt-3">
              <Stat label="Required missing" value={summary.overall.requiredMissing} />
              <Stat label="In progress / untracked" value={summary.overall.requiredUntracked} />
              <Stat label="Universities" value={summary.universities.length} />
            </dl>
            <p className="text-[12px] leading-relaxed text-muted">
              Checklist progress against what the verified sources state. Conditional and optional documents never
              count against it. This does not confirm you are eligible or that your application is ready to submit.
            </p>
          </>
        ) : (
          <p className="text-[12.5px] text-muted">Loading checklist progress…</p>
        )}
      </Card>

      {/* ---------------- common documents ---------------- */}
      {summary && (
        <Card className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold text-ink">Common application documents</p>
            <p className="text-[12.5px] text-muted">
              {summary.common.requiredReady} / {summary.common.requiredTotal} required ready
            </p>
          </div>
          <Bar ready={summary.common.requiredReady} total={summary.common.requiredTotal} label="Common documents ready" />
          {missingCommon.length > 0 && (
            <div>
              <MicroLabel>Missing</MicroLabel>
              <ul className="mt-1 flex flex-col gap-0.5">
                {missingCommon.slice(0, 3).map((label) => (
                  <li key={label} className="text-[12.5px] text-muted">
                    · {label}
                  </li>
                ))}
              </ul>
              {missingCommon.length > 3 && (
                <p className="mt-1 text-[12px] text-muted">and {missingCommon.length - 3} more</p>
              )}
            </div>
          )}
          <Link href={readinessHref(app)} className="text-[12.5px] font-medium text-primary hover:underline">
            View checklist
          </Link>
        </Card>
      )}

      {/* ---------------- universities ---------------- */}
      {summary && summary.universities.length > 0 && (
        <div>
          <MicroLabel>Universities</MicroLabel>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.universities.map((u, i) => {
              const unavailable = snapshot?.unavailable.includes(u.name);
              return (
                <Card key={u.id} className="flex flex-col gap-2.5">
                  <div>
                    <p className="text-[13.5px] font-semibold leading-snug text-ink">
                      <span className="text-muted">{i + 1}.</span> {u.name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">{u.major || "No department chosen"}</p>
                  </div>
                  <div className="border-t border-hairline pt-2.5">
                    <MicroLabel>Requirements progress</MicroLabel>
                    {unavailable ? (
                      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                        Verified requirement data currently unavailable
                      </p>
                    ) : u.requiredTotal === 0 ? (
                      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                        No additional verified required documents
                      </p>
                    ) : (
                      <>
                        <p className="mt-1 text-[13.5px] font-medium text-ink">
                          {u.requiredReady} / {u.requiredTotal} required ready
                        </p>
                        <Bar className="mt-1.5" ready={u.requiredReady} total={u.requiredTotal} label={`${u.name} required ready`} />
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      href={requirementHref(app, u.name, u.major)}
                      className="text-[12.5px] font-medium text-primary hover:underline"
                    >
                      View requirements
                    </Link>
                    <Link href={readinessHref(app)} className="text-[12.5px] font-medium text-muted hover:text-ink">
                      Open readiness
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- deadlines and notices ---------------- */}
      {/* Only rendered with a saved application: without a program and track
          there is nothing to match against, and guessing one would be exactly
          the inference this feature forbids. A profile with no application
          year falls back to the dataset's own cycle rather than inventing one. */}
      <DeadlineNoticeFeed
        program={app.program}
        track={app.track}
        cycle={cycle ?? deadlineNoticeDataset.generated_for_cycle}
        attention={{
          missing: summary?.overall.requiredMissing ?? 0,
          untracked: summary?.overall.requiredUntracked ?? 0,
          readinessHref: readinessHref(app),
        }}
        liveNotices={liveNotices ?? []}
      />

      {/* ---------------- quick actions ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Quick href={readinessHref(app)} icon={<FolderCheck className="h-4 w-4 text-muted" />} label="Continue application" />
        <Quick href="/requirement-checker" icon={<ClipboardCheck className="h-4 w-4 text-muted" />} label="Requirement Checker" />
        <Quick href="/interview-db" icon={<MessageSquare className="h-4 w-4 text-muted" />} label="Interview DB" />
        <Quick href="/notices" icon={<Megaphone className="h-4 w-4 text-muted" />} label="Official Notices" />
      </div>
    </div>
  );
}

function Quick({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href}>
      <Card interactive className="h-full">
        {icon}
        <p className="mt-2 text-[13px] font-medium leading-snug text-ink">{label}</p>
      </Card>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

function Bar({
  ready,
  total,
  label,
  className,
}: {
  ready: number;
  total: number;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-canvas", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={ready}
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${total ? (ready / total) * 100 : 0}%` }}
      />
    </div>
  );
}
