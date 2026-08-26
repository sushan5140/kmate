"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
}: {
  options: CheckerOptions;
  initial: { program: string; track: string; university: string; major: string; gender: string };
}) {
  const router = useRouter();
  const [program, setProgram] = useState(initial.program);
  const [track, setTrack] = useState(initial.track);
  const [university, setUniversity] = useState(initial.university);
  const [major, setMajor] = useState(initial.major);
  const [gender, setGender] = useState(initial.gender);
  const [pending, setPending] = useState(false);

  const trackOptions = program ? options.tracks[program] ?? [] : [];
  const universityOptions = useMemo(
    () => (program && track ? options.universities[`${program}|${track}`] ?? [] : []),
    [options, program, track]
  );
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
    setUniversity("");
    setMajor("");
    setGender("");
  }
  function pickTrack(value: string) {
    setTrack(value === track ? "" : value);
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
    setPending(true);
    const params = new URLSearchParams({ program, track, university, check: "1" });
    if (major.trim()) params.set("major", major.trim());
    if (gender) params.set("gender", gender);
    router.push(`/requirement-checker?${params.toString()}`);
  }

  function reset() {
    setProgram("");
    setTrack("");
    setUniversity("");
    setMajor("");
    setGender("");
    router.push("/requirement-checker");
  }

  const ready = Boolean(program && track && university);

  return (
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
          <div className="flex flex-wrap gap-1.5">
            {trackOptions.map((t) => (
              <Chip key={t.value} active={track === t.value} onClick={() => pickTrack(t.value)}>
                {t.label}
                <span className="ml-1.5 text-[11px] opacity-70">{t.count}</span>
              </Chip>
            ))}
          </div>
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
        <Button onClick={check} disabled={!ready || pending}>
          <Search className="h-3.5 w-3.5" />
          {pending ? "Checking…" : "Check requirements"}
        </Button>
      </div>
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
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-muted hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
