"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { RotateCcw, Search } from "lucide-react";
import { Card, MicroLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { CheckerOptions } from "@/lib/requirements/options";

/**
 * The Program -> Track -> University -> Major flow.
 *
 * Selections live in the URL rather than component state alone, so a checked
 * result is linkable and the back button works. The dataset itself stays on
 * the server; this component only ever sees the names it renders.
 */
export function RequirementForm({
  options,
  initial,
  children,
}: {
  options: CheckerOptions;
  initial: { program: string; track: string; subtype: string; university: string; major: string; gender: string };
  /** The results for the checked selection, rendered below the form. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [program, setProgram] = useState(initial.program);
  const [track, setTrack] = useState(initial.track);
  const [subtype, setSubtype] = useState(initial.subtype);
  const [university, setUniversity] = useState(initial.university);
  const [major, setMajor] = useState(initial.major);
  const [gender, setGender] = useState(initial.gender);

  // useTransition rather than a hand-managed `pending` flag. The previous
  // version set pending=true before router.push and had nothing to clear it,
  // so after one check the button stayed disabled forever and every later
  // check silently did nothing -- leaving the previous university's result on
  // screen. isPending is owned by React and clears when the navigation
  // commits, so there is no longer a flag anyone can forget to reset.
  const [isPending, startTransition] = useTransition();

  const trackOptions = useMemo(
    () => (program ? options.tracks[program] ?? [] : []),
    [options, program]
  );
  const subtypeOptions = useMemo(
    () => trackOptions.find((t) => t.value === track)?.subtypes ?? [],
    [trackOptions, track]
  );
  // Top-level track first, then narrowed by subtype when one is chosen.
  const universityOptions = useMemo(() => {
    if (!program || !track) return [];
    if (subtype) return options.universities[`${program}|${track}|${subtype}`] ?? [];
    return options.universities[`${program}|${track}`] ?? [];
  }, [options, program, track, subtype]);
  const meta = useMemo(
    () =>
      options.meta[`${program}|${track}|${university}`] ?? {
        needsGender: false,
        majorSuggestions: [] as string[],
      },
    [options, program, track, university]
  );

  // Each step invalidates everything downstream, so a stale university can
  // never survive a track change and be submitted against the wrong track.
  function pickProgram(value: string) {
    setProgram(value === program ? "" : value);
    setTrack("");
    setSubtype("");
    setUniversity("");
    setMajor("");
    setGender("");
  }
  function pickTrack(value: string) {
    setTrack(value === track ? "" : value);
    setSubtype("");
    setUniversity("");
    setMajor("");
    setGender("");
  }
  function pickSubtype(value: string) {
    setSubtype(value === subtype ? "" : value);
    setUniversity("");
    setMajor("");
    setGender("");
  }
  function pickUniversity(value: string) {
    setUniversity(value);
    setMajor("");
    setGender("");
  }

  function check() {
    if (!program || !track || !university) return;
    const params = new URLSearchParams({ program, track, university, check: "1" });
    if (subtype) params.set("subtype", subtype);
    if (major.trim()) params.set("major", major.trim());
    if (gender) params.set("gender", gender);
    startTransition(() => router.push(`/requirement-checker?${params.toString()}`));
  }

  function reset() {
    setProgram("");
    setTrack("");
    setSubtype("");
    setUniversity("");
    setMajor("");
    setGender("");
    // The bare URL carries no selection, so the page re-renders with empty
    // props and the keyed remount (see page.tsx) gives a clean instance --
    // nothing from the previous selection can survive.
    startTransition(() => router.push("/requirement-checker"));
  }

  const ready = Boolean(program && track && university);

  // True when the form no longer matches the selection the results below were
  // computed for. Showing a Chonnam result under a Korea University selection
  // is worse than showing nothing, so the results are withheld until the user
  // checks again.
  const stale =
    program !== initial.program ||
    track !== initial.track ||
    subtype !== initial.subtype ||
    university !== initial.university ||
    major.trim() !== initial.major ||
    gender !== initial.gender;

  return (
    <>
      <Card className="flex flex-col gap-4">
      <Step index={1} label="GKS program" done={Boolean(program)}>
        <div className="flex flex-wrap gap-1.5">
          {options.programs.map((p) => (
            <Chip key={p.value} active={program === p.value} onClick={() => pickProgram(p.value)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </Step>

      <Step index={2} label="Track" done={Boolean(track)} disabled={!program}>
        {!program ? (
          <p className="text-[12.5px] text-muted">Choose a program first.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {trackOptions.map((t) => (
                <Chip key={t.value} active={track === t.value} onClick={() => pickTrack(t.value)}>
                  {t.label}
                  <span className="ml-1.5 text-[11px] opacity-70">{t.count}</span>
                </Chip>
              ))}
            </div>

            {/* Sub-routes of the chosen track, shown only where the program
                actually has them. Optional: leaving it unset keeps every
                university on the track, which is the safe default when the
                applicant doesn't know their sub-route yet. */}
            {subtypeOptions.length > 0 && (
              <div className="mt-2.5">
                <p className="text-[11.5px] text-muted">Sub-route (optional)</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {subtypeOptions.map((s) => (
                    <Chip key={s.value} small active={subtype === s.value} onClick={() => pickSubtype(s.value)}>
                      {s.label}
                      <span className="ml-1.5 text-[11px] opacity-70">{s.count}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Step>

      <Step index={3} label="University" done={Boolean(university)} disabled={!track}>
        {!track ? (
          <p className="text-[12.5px] text-muted">Choose a track first.</p>
        ) : (
          <>
            <select
              value={university}
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
              {universityOptions.length} universities listed for this program and track.
            </p>
          </>
        )}
      </Step>

      <Step index={4} label="Major / department (optional)" done={false} disabled={!university}>
        {!university ? (
          <p className="text-[12.5px] text-muted">Choose a university first.</p>
        ) : (
          <>
            <input
              type="text"
              value={major}
              onChange={(e) => setMajor(e.target.value.slice(0, 120))}
              placeholder="e.g. Software"
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
            />
            {meta.majorSuggestions.length > 0 && (
              <div className="mt-2">
                <p className="text-[11.5px] text-muted">
                  Majors named in this university&apos;s verified rules:
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {meta.majorSuggestions.map((m) => (
                    <Chip key={m} small active={major === m} onClick={() => setMajor(m)}>
                      {m}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Step>

      {/* Only asked for when a structured rule at this university actually
          uses it -- no profile detail is collected speculatively. */}
      {meta.needsGender && (
        <Step index={5} label="Gender" done={Boolean(gender)}>
          <p className="mb-1.5 text-[12px] text-muted">
            This university has a verified rule that depends on gender.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { value: "female", label: "Female" },
              { value: "male", label: "Male" },
              { value: "other", label: "Other" },
              { value: "prefer_not_to_say", label: "Prefer not to say" },
            ].map((g) => (
              <Chip key={g.value} small active={gender === g.value} onClick={() => setGender(g.value)}>
                {g.label}
              </Chip>
            ))}
          </div>
        </Step>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3.5">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
        <Button onClick={check} disabled={!ready || isPending}>
          <Search className="h-3.5 w-3.5" />
          {isPending ? "Checking…" : "Check requirements"}
        </Button>
      </div>
      </Card>

      {/* Results are withheld while the form has moved on from what was
          checked -- otherwise changing the university leaves the previous
          university's requirements sitting underneath it. */}
      {children && !stale && children}
      {children && stale && !isPending && (
        <p className="text-[12.5px] text-muted">
          Your selection has changed. Check requirements again to see results for it.
        </p>
      )}
    </>
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
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-muted hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
