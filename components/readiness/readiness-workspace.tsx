"use client";

import { useRouter } from "next/navigation";
import { useMemo, useSyncExternalStore, useTransition } from "react";
import { ArrowDown, ArrowDownToLine, ArrowUp, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { Card, MicroLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { CheckerOptions } from "@/lib/requirements/options";
import type { ProfileDefaults } from "@/lib/readiness/profile";
import {
  EMPTY_PROGRESS,
  describeSlots,
  parseProgress,
  overallProgress,
  progressOf,
  storageKeyFor,
  universityAnchor,
  type ApplicationConfig,
  type ApplicationReadiness,
  type SectionProgress,
  type StoredProgress,
} from "@/lib/readiness/application";
import type { ApplicantDocumentState, ReadinessItem } from "@/lib/readiness/schema";
import { ChecklistSection } from "@/components/readiness/readiness-checklist";
import { SaveApplication } from "@/components/readiness/save-application";

/**
 * The multi-university application workspace.
 *
 * Configuration (program, track, program type, the chosen universities and
 * each one's department) lives in the URL, so the application is linkable, the
 * browser's back and forward buttons work, and a refresh restores exactly what
 * was on screen. Document progress lives in this browser's localStorage under
 * one key per application route.
 *
 * Progress is deliberately NOT keyed on the university list: reordering the
 * slots or dropping one would otherwise produce a different key and silently
 * abandon the applicant's work. Each university's ticks are filed under its own
 * name inside that one record instead.
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
function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private window or blocked site data: the workspace still works, it just
    // cannot remember anything.
    return null;
  }
}

export function ReadinessWorkspace({
  options,
  defaults,
  usingDefaults,
  config,
  slots,
  pool,
  majorSuggestions,
  workspace,
}: {
  options: CheckerOptions;
  defaults: ProfileDefaults;
  usingDefaults: boolean;
  config: ApplicationConfig;
  slots: number;
  pool: string[];
  majorSuggestions: Record<string, string[]>;
  workspace: ApplicationReadiness | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { program, track, subtype, universities } = config;

  const storageKey = storageKeyFor(program, track, subtype);
  const raw = useSyncExternalStore(
    subscribe,
    () => (program ? readRaw(storageKey) : null),
    () => null
  );
  const stored: StoredProgress = useMemo(() => (program ? parseProgress(raw) : EMPTY_PROGRESS), [program, raw]);

  function write(next: StoredProgress) {
    try {
      const empty = Object.keys(next.common).length === 0 && Object.keys(next.byUniversity).length === 0;
      if (empty) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* not remembered, but still usable this session */
    }
    emit();
  }

  const setCommon = (id: string, state: ApplicantDocumentState | null) => {
    const common = { ...stored.common };
    if (state === null) delete common[id];
    else common[id] = state;
    write({ ...stored, common });
  };

  const setForUniversity = (uni: string, id: string, state: ApplicantDocumentState | null) => {
    const forUni = { ...(stored.byUniversity[uni] ?? {}) };
    if (state === null) delete forUni[id];
    else forUni[id] = state;
    const byUniversity = { ...stored.byUniversity };
    if (Object.keys(forUni).length === 0) delete byUniversity[uni];
    else byUniversity[uni] = forUni;
    write({ ...stored, byUniversity });
  };

  /* ---------------- configuration -> URL ---------------- */

  function go(next: Partial<ApplicationConfig>) {
    const merged = { ...config, ...next };
    const params = new URLSearchParams();
    if (merged.program) params.set("program", merged.program);
    if (merged.track) params.set("track", merged.track);
    if (merged.subtype) params.set("subtype", merged.subtype);
    for (const u of merged.universities) {
      params.append("uni", u.name);
      // Always paired, so an empty major cannot shift the following slot's.
      params.append("maj", u.major);
    }
    // From here on the URL is the applicant's own; profile defaults are not
    // reapplied, so clearing a prefilled field actually clears it.
    params.set("own", "1");
    startTransition(() => router.push(`/application-readiness?${params.toString()}`));
  }

  const trackOptions = useMemo(() => (program ? options.tracks[program] ?? [] : []), [options, program]);
  const subtypeOptions = useMemo(
    () => trackOptions.find((t) => t.value === track)?.subtypes ?? [],
    [trackOptions, track]
  );
  const available = useMemo(
    () => pool.filter((name) => !universities.some((u) => u.name === name)),
    [pool, universities]
  );

  const pickProgram = (v: string) =>
    go({ program: v === program ? "" : v, track: "", subtype: "", universities: [] });
  const pickTrack = (v: string) => go({ track: v === track ? "" : v, subtype: "", universities: [] });
  const pickSubtype = (v: string) => go({ subtype: v === subtype ? "" : v, universities: [] });

  const addUniversity = (name: string) => {
    if (!name || universities.some((u) => u.name === name) || universities.length >= slots) return;
    go({ universities: [...universities, { name, major: "" }] });
  };
  const removeUniversity = (name: string) =>
    go({ universities: universities.filter((u) => u.name !== name) });
  const setMajor = (name: string, major: string) =>
    go({ universities: universities.map((u) => (u.name === name ? { ...u, major } : u)) });
  const move = (index: number, delta: number) => {
    const next = [...universities];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    go({ universities: next });
  };

  /* ---------------- reset actions ---------------- */

  function resetProgress() {
    // Selections stay; only the ticks go.
    write(EMPTY_PROGRESS);
  }
  function startNewApplication() {
    // This application's saved progress, and only this one -- every other
    // route's saved checklist is left alone. Then back to a bare URL, which
    // reloads the profile defaults.
    write(EMPTY_PROGRESS);
    startTransition(() => router.push("/application-readiness"));
  }

  /* ---------------- overlay stored progress ---------------- */

  const commonItems: ReadinessItem[] = useMemo(
    () => (workspace?.common ?? []).map((i) => ({ ...i, progress: stored.common[i.id] ?? "untracked" })),
    [workspace, stored]
  );
  const universitySections = useMemo(
    () =>
      (workspace?.universities ?? []).map((section) => ({
        ...section,
        items: section.items.map((i) => ({
          ...i,
          progress: stored.byUniversity[section.university]?.[i.id] ?? "untracked",
        })),
      })),
    [workspace, stored]
  );

  // Derived from the same stored progress the checklist rows write to, so
  // every figure above updates the moment a row is tapped -- no refresh, and no
  // second source of truth.
  const commonProgress = progressOf(commonItems);
  const overall = overallProgress(
    commonProgress,
    universitySections.map((s) => progressOf(s.items))
  );

  return (
    <div className={cn("flex flex-col gap-5", isPending && "opacity-70")}>
      <Card className="flex flex-col gap-4">
        {usingDefaults && (defaults.from.program || defaults.from.universities) && (
          <div className="flex items-start gap-2 rounded-xl bg-primary/5 px-3.5 py-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-[12.5px] leading-relaxed text-muted">
              Started from your KMate profile. Change anything here and it applies to this application only —
              your profile is not touched.
            </p>
          </div>
        )}

        <Step index={1} label="GKS program" done={Boolean(program)} from={usingDefaults && defaults.from.program}>
          <div className="flex flex-wrap gap-1.5">
            {options.programs.map((p) => (
              <Chip key={p.value} active={program === p.value} onClick={() => pickProgram(p.value)}>
                {p.label}
              </Chip>
            ))}
          </div>
        </Step>

        <Step
          index={2}
          label="Track"
          done={Boolean(track)}
          disabled={!program}
          from={usingDefaults && defaults.from.track}
        >
          {!program ? (
            <p className="text-[12.5px] text-muted">Choose a program first.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {trackOptions.map((t) => (
                <Chip key={t.value} active={track === t.value} onClick={() => pickTrack(t.value)}>
                  {t.label}
                </Chip>
              ))}
            </div>
          )}
        </Step>

        <Step
          index={3}
          label="Program type"
          done={Boolean(subtype)}
          disabled={!track}
          from={usingDefaults && defaults.from.track && Boolean(defaults.subtype)}
        >
          {!track ? (
            <p className="text-[12.5px] text-muted">Choose a track first.</p>
          ) : subtypeOptions.length === 0 ? (
            <p className="text-[12.5px] text-muted">This track has no separate program types.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {subtypeOptions.map((s) => (
                <Chip key={s.value} small active={subtype === s.value} onClick={() => pickSubtype(s.value)}>
                  {s.label}
                </Chip>
              ))}
            </div>
          )}
        </Step>

        <Step
          index={4}
          label="Selected universities"
          done={universities.length > 0}
          disabled={!track}
          from={usingDefaults && defaults.from.universities}
        >
          {!track ? (
            <p className="text-[12.5px] text-muted">Choose a track first.</p>
          ) : (
            <>
              <ol className="flex flex-col gap-2.5">
                {universities.map((u, i) => (
                  <li key={u.name} className="rounded-xl border border-hairline px-3.5 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-ink">
                        <span className="text-muted">{i + 1}.</span> {u.name}
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label="Move down"
                          disabled={i === universities.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton label={`Remove ${u.name}`} onClick={() => removeUniversity(u.name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </div>

                    <div className="mt-2">
                      <label className="text-[11.5px] text-muted" htmlFor={`major-${i}`}>
                        Major / department at this university (optional)
                      </label>
                      <input
                        id={`major-${i}`}
                        type="text"
                        defaultValue={u.major}
                        onBlur={(e) => setMajor(u.name, e.target.value.slice(0, 120))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        placeholder="e.g. Computer Science"
                        className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                      />
                      {(majorSuggestions[u.name] ?? []).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {majorSuggestions[u.name].map((m) => (
                            <Chip key={m} small active={u.major === m} onClick={() => setMajor(u.name, m)}>
                              {m}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              {universities.length < slots ? (
                <div className={cn(universities.length > 0 && "mt-2.5")}>
                  <label className="sr-only" htmlFor="add-university">
                    Add university
                  </label>
                  <select
                    id="add-university"
                    value=""
                    onChange={(e) => addUniversity(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                  >
                    <option value="">
                      {universities.length === 0 ? "Add a university…" : "Add another university…"}
                    </option>
                    {/* Already-chosen universities are absent from this list,
                        so the same one cannot be picked twice. */}
                    {available.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-muted">
                    <Plus className="h-3 w-3" />
                    {universities.length} of {slots} chosen. {describeSlots(program, track, subtype)}
                  </p>
                </div>
              ) : (
                <p className="mt-2.5 text-[11.5px] text-muted">
                  {describeSlots(program, track, subtype)} Remove one to swap it.
                </p>
              )}

              {/* A university KMate holds no verified record for is named
                  plainly and left out, never given guessed requirements. */}
              {usingDefaults && defaults.unresolvedUniversities.length > 0 && (
                <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                  <span className="font-medium text-ink">
                    No verified Requirement Checker record available
                  </span>{" "}
                  for {defaults.unresolvedUniversities.join(", ")}, saved on your profile.{" "}
                  {defaults.unresolvedUniversities.length === 1
                    ? "It has been left out of this application rather than guessed"
                    : "They have been left out of this application rather than guessed"}
                  , which does not mean {defaults.unresolvedUniversities.length === 1 ? "it is" : "they are"}{" "}
                  ineligible — check the official GKS page.
                </p>
              )}
            </>
          )}
        </Step>

        {program && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3.5">
            {/* Saves the configuration only -- progress stays in the readiness
                store this page already writes to. */}
            <SaveApplication program={program} track={track} subtype={subtype} universities={universities} />
            <button
              type="button"
              onClick={startNewApplication}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Start new application
            </button>
            {isPending && <span className="text-[12.5px] text-muted">Loading…</span>}
          </div>
        )}
      </Card>

      {workspace && (
        <>
          {/* ------------ overall application progress ------------ */}
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <MicroLabel>Overall application progress</MicroLabel>
              <button
                type="button"
                onClick={resetProgress}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset progress
              </button>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <p className="text-[30px] font-semibold leading-none tracking-tight text-ink">
                {overall.percent === null ? "—" : `${overall.percent}%`}
              </p>
              <p className="text-[13px] text-muted">
                {overall.requiredTotal === 0
                  ? "No required documents recorded for this selection"
                  : `${overall.requiredReady} / ${overall.requiredTotal} required documents ready`}
              </p>
            </div>

            <ProgressBar
              ready={overall.requiredReady}
              total={overall.requiredTotal}
              label="Overall required documents ready"
            />

            {/* Four figures, so the bar can be read at a glance without
                scrolling the whole checklist. */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-hairline pt-3 sm:grid-cols-4">
              <Stat label="Common docs" value={`${commonProgress.requiredReady} / ${commonProgress.requiredTotal}`} />
              <Stat label="Required missing" value={overall.requiredMissing} />
              <Stat label="Conditional" value={overall.conditionalTotal} />
              <Stat label="Not yet tracked" value={overall.untracked} />
            </dl>

            {universitySections.length > 0 && (
              <p className="text-[12.5px] text-muted">
                {overall.universitiesWithOutstanding === 0
                  ? `No outstanding required items across your ${universitySections.length} ${
                      universitySections.length === 1 ? "university" : "universities"
                    }.`
                  : `${overall.universitiesWithOutstanding} of ${universitySections.length} ${
                      universitySections.length === 1 ? "university has" : "universities have"
                    } unresolved required items.`}
              </p>
            )}

            <p className="text-[12px] leading-relaxed text-muted">
              This is checklist progress against what the verified sources state. Conditional and optional
              documents are listed separately and never count against it. It does not confirm you are
              eligible or that your application is ready to submit.
            </p>
          </Card>

          {/* ------------ one compact card per university ------------ */}
          {universitySections.length > 0 && (
            <div>
              <MicroLabel>University progress</MicroLabel>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {universitySections.map((s, i) => (
                  <UniversityCard
                    key={s.university}
                    index={i + 1}
                    section={s}
                    progress={progressOf(s.items)}
                  />
                ))}
              </div>
            </div>
          )}

          {workspace.warnings.length > 0 && (
            <Card className="flex flex-col gap-2">
              <MicroLabel>Before you rely on this</MicroLabel>
              <ul className="flex flex-col gap-1.5">
                {workspace.warnings.map((w, i) => (
                  <li key={i} className="text-[12.5px] leading-relaxed text-muted">
                    · {w}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <ChecklistSection
            heading="Common application documents"
            subheading="Filed once for your whole GKS application, however many universities you name."
            headerProgress={commonProgress}
            items={commonItems}
            onChange={setCommon}
          />

          {universitySections.map((s) => (
            <ChecklistSection
              key={s.university}
              anchorId={universityAnchor(s.university)}
              heading={s.university}
              subheading={s.major || undefined}
              headerProgress={progressOf(s.items)}
              items={s.items}
              onChange={(id, state) => setForUniversity(s.university, id, state)}
              emptyNote="No additional verified requirements are recorded for this university on this route. That is not the same as there being none — check its official GKS page."
            />
          ))}
        </>
      )}
    </div>
  );
}

/** One compact summary of a single university's own requirement overlay. */
function UniversityCard({
  index,
  section,
  progress,
}: {
  index: number;
  section: { university: string; major: string; items: ReadinessItem[] };
  progress: SectionProgress;
}) {
  const anchor = universityAnchor(section.university);
  // A university whose verified items are all conditional has nothing
  // outstanding to complete -- reporting that as 100% would imply work that
  // was never there, so it gets a zero-state instead of a full bar.
  const noRequired = progress.requiredTotal === 0;

  return (
    <Card className="flex flex-col gap-2.5">
      <div>
        <p className="text-[13.5px] font-semibold leading-snug text-ink">
          <span className="text-muted">{index}.</span> {section.university}
        </p>
        <p className="mt-0.5 text-[12px] text-muted">{section.major || "No department chosen"}</p>
      </div>

      <div className="border-t border-hairline pt-2.5">
        <MicroLabel>Requirements</MicroLabel>
        {noRequired ? (
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            No additional verified required documents
          </p>
        ) : (
          <>
            <p className="mt-1 text-[13.5px] font-medium text-ink">
              {progress.requiredReady} / {progress.requiredTotal} required ready
            </p>
            <ProgressBar
              className="mt-1.5"
              ready={progress.requiredReady}
              total={progress.requiredTotal}
              label={`${section.university}: required documents ready`}
            />
          </>
        )}

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted">
          {progress.requiredMissing > 0 && <span>{progress.requiredMissing} missing</span>}
          {progress.conditionalTotal > 0 && <span>{progress.conditionalTotal} conditional</span>}
          {progress.optionalTotal > 0 && <span>{progress.optionalTotal} optional</span>}
          {progress.itemTotal === 0 && <span>Nothing recorded for this route</span>}
        </div>
      </div>

      {progress.itemTotal > 0 && (
        <a
          href={`#${anchor}`}
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline"
        >
          View details
          <ArrowDownToLine className="h-3 w-3" />
        </a>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

function ProgressBar({
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

function Step({
  index,
  label,
  done,
  disabled,
  from,
  children,
}: {
  index: number;
  label: string;
  done: boolean;
  disabled?: boolean;
  from?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(disabled && "opacity-55")}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
            done ? "bg-primary text-white" : "bg-canvas text-muted"
          )}
        >
          {index}
        </span>
        <MicroLabel>{label}</MicroLabel>
        {/* Shown only on the steps a profile value actually filled, rather than
            badging every field. */}
        {from && <span className="text-[11px] text-primary">From your KMate profile</span>}
      </div>
      <div className="mt-2 pl-7">{children}</div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full border border-border bg-white p-1.5 text-muted hover:text-ink",
        disabled && "cursor-not-allowed opacity-40 hover:text-muted"
      )}
    >
      {children}
    </button>
  );
}

function Chip({
  active,
  onClick,
  small,
  children,
}: {
  active: boolean;
  onClick: () => void;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border font-medium",
        small ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-white text-muted hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
