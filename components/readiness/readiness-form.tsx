"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Card, MicroLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { CheckerOptions } from "@/lib/requirements/options";

/**
 * Program -> Track -> Program type -> University -> Major.
 *
 * The same five steps as the Requirement Checker, reading the same option tree
 * so the two pages can never disagree about which tracks exist or which
 * universities sit under one.
 *
 * Unlike the Requirement Checker there is no "Check" button: the checklist for
 * a program is useful the moment the program is picked, so every selection
 * writes straight to the URL and the server re-renders from it. That also
 * means this component holds no selection state of its own to fall out of sync
 * -- what the URL says is what is shown.
 */

interface Selection {
  program: string;
  track: string;
  subtype: string;
  university: string;
  major: string;
}

export function ReadinessForm({
  options,
  initial,
  majorSuggestions,
}: {
  options: CheckerOptions;
  initial: Selection;
  majorSuggestions: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // The only local state: the major text box, which would otherwise navigate
  // on every keystroke. It is committed on blur or Enter.
  const [majorDraft, setMajorDraft] = useState(initial.major);

  const trackOptions = useMemo(
    () => (initial.program ? options.tracks[initial.program] ?? [] : []),
    [options, initial.program]
  );
  const subtypeOptions = useMemo(
    () => trackOptions.find((t) => t.value === initial.track)?.subtypes ?? [],
    [trackOptions, initial.track]
  );
  const universityOptions = useMemo(() => {
    if (!initial.program || !initial.track) return [];
    if (initial.subtype)
      return options.universities[`${initial.program}|${initial.track}|${initial.subtype}`] ?? [];
    return options.universities[`${initial.program}|${initial.track}`] ?? [];
  }, [options, initial.program, initial.track, initial.subtype]);

  function go(next: Partial<Selection>) {
    const merged: Selection = { ...initial, ...next };
    const params = new URLSearchParams();
    if (merged.program) params.set("program", merged.program);
    if (merged.track) params.set("track", merged.track);
    if (merged.subtype) params.set("subtype", merged.subtype);
    if (merged.university) params.set("university", merged.university);
    if (merged.major.trim()) params.set("major", merged.major.trim());
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/application-readiness?${qs}` : "/application-readiness"));
  }

  // Each step clears everything downstream, so a university can never survive
  // a track change and pull in extras from a route that was not chosen.
  const pickProgram = (value: string) =>
    go({ program: value === initial.program ? "" : value, track: "", subtype: "", university: "", major: "" });
  const pickTrack = (value: string) =>
    go({ track: value === initial.track ? "" : value, subtype: "", university: "", major: "" });
  const pickSubtype = (value: string) =>
    go({ subtype: value === initial.subtype ? "" : value, university: "", major: "" });
  const pickUniversity = (value: string) => go({ university: value, major: "" });

  function commitMajor() {
    if (majorDraft.trim() === initial.major.trim()) return;
    go({ major: majorDraft });
  }

  return (
    <Card className={cn("flex flex-col gap-4", isPending && "opacity-70")}>
      <Step index={1} label="GKS program" done={Boolean(initial.program)}>
        <div className="flex flex-wrap gap-1.5">
          {options.programs.map((p) => (
            <Chip key={p.value} active={initial.program === p.value} onClick={() => pickProgram(p.value)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </Step>

      {/* Top-level routes only -- the program types live in step 3, exactly as
          on the Requirement Checker. */}
      <Step index={2} label="Track (optional)" done={Boolean(initial.track)} disabled={!initial.program}>
        {!initial.program ? (
          <p className="text-[12.5px] text-muted">Choose a program first.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {trackOptions.map((t) => (
                <Chip key={t.value} active={initial.track === t.value} onClick={() => pickTrack(t.value)}>
                  {t.label}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] text-muted">
              Needed only to add university-specific documents. The national checklist below is the same
              either way.
            </p>
          </>
        )}
      </Step>

      <Step
        index={3}
        label="Program type (optional)"
        done={Boolean(initial.subtype)}
        disabled={!initial.track}
      >
        {!initial.track ? (
          <p className="text-[12.5px] text-muted">Choose a track first.</p>
        ) : subtypeOptions.length === 0 ? (
          <p className="text-[12.5px] text-muted">This track has no separate program types.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {subtypeOptions.map((s) => (
              <Chip
                key={s.value}
                small
                active={initial.subtype === s.value}
                onClick={() => pickSubtype(s.value)}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        )}
      </Step>

      <Step index={4} label="University (optional)" done={Boolean(initial.university)} disabled={!initial.track}>
        {!initial.track ? (
          <p className="text-[12.5px] text-muted">Choose a track first.</p>
        ) : (
          <>
            <select
              value={initial.university}
              onChange={(e) => pickUniversity(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
            >
              <option value="">Select a university…</option>
              {universityOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11.5px] text-muted">
              {universityOptions.length} universities listed for this selection.
            </p>
          </>
        )}
      </Step>

      <Step index={5} label="Major / department (optional)" done={false} disabled={!initial.university}>
        {!initial.university ? (
          <p className="text-[12.5px] text-muted">Choose a university first.</p>
        ) : (
          <>
            <input
              type="text"
              value={majorDraft}
              onChange={(e) => setMajorDraft(e.target.value.slice(0, 120))}
              onBlur={commitMajor}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitMajor();
                }
              }}
              placeholder="e.g. College of Maritime Sciences"
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
            />
            <p className="mt-1.5 text-[11.5px] text-muted">
              Only needed when a verified university rule depends on the department.
            </p>
            {majorSuggestions.length > 0 && (
              <div className="mt-2">
                <p className="text-[11.5px] text-muted">Majors named in this university&apos;s verified rules:</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {majorSuggestions.map((m) => (
                    <Chip
                      key={m}
                      small
                      active={initial.major === m}
                      onClick={() => {
                        setMajorDraft(m);
                        go({ major: m });
                      }}
                    >
                      {m}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Step>

      {(initial.program || initial.track || initial.university) && (
        <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3.5">
          <button
            type="button"
            onClick={() => {
              setMajorDraft("");
              go({ program: "", track: "", subtype: "", university: "", major: "" });
            }}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Clear selection
          </button>
          {isPending && <span className="text-[12.5px] text-muted">Loading…</span>}
        </div>
      )}
    </Card>
  );
}

function Step({
  index,
  label,
  done,
  disabled,
  children,
}: {
  index: number;
  label: string;
  done: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(disabled && "opacity-55")}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
            done ? "bg-primary text-white" : "bg-canvas text-muted"
          )}
        >
          {index}
        </span>
        <MicroLabel>{label}</MicroLabel>
      </div>
      <div className="mt-2 pl-7">{children}</div>
    </div>
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
