import type { ReadinessItem, ReadinessResult } from "./schema";

/**
 * Recomputes the readiness summary on the client.
 *
 * The engine already produces this, but only from progress passed into it.
 * In this first version progress lives in the browser's localStorage and never
 * reaches the server, so the page renders items with `progress: "untracked"`
 * and the client overlays what it has stored. This mirrors the engine's rules
 * exactly rather than inventing its own; `lib/readiness/__tests.ts` asserts the
 * two agree, so a change to one without the other fails the checks.
 *
 * The rule worth stating out loud: `completion_percent` divides by the FULL
 * required total, not by how many are tracked. An applicant who has marked
 * three of eleven required documents ready sees 27%, never 100% -- an
 * untracked document is unknown, not done. It stays null until at least one
 * required item is tracked, so an untouched checklist shows no figure at all.
 */
export function summarizeReadiness(items: ReadinessItem[]): ReadinessResult["summary"] {
  const required = items.filter((i) => i.status === "required");
  const requiredReady = required.filter((i) => i.progress === "ready").length;
  const requiredMissing = required.filter((i) => i.progress === "missing").length;
  const trackedRequired = required.filter((i) => i.progress !== "untracked").length;

  return {
    required_total: required.length,
    required_ready: requiredReady,
    required_missing: requiredMissing,
    conditional_total: items.filter((i) => i.status === "conditional").length,
    optional_total: items.filter((i) => i.status === "optional").length,
    completion_percent:
      trackedRequired === 0 ? null : Math.round((requiredReady / required.length) * 100),
  };
}

/** True when every required item has been given a progress state. */
export function allRequiredTracked(items: ReadinessItem[]): boolean {
  const required = items.filter((i) => i.status === "required");
  return required.length > 0 && required.every((i) => i.progress !== "untracked");
}

/**
 * A required document with no condition attached cannot be waived by the
 * applicant deciding it does not apply to them. Marking one "Not applicable"
 * is surfaced as a warning rather than blocked outright -- the checklist is a
 * planning aid, not an authority on the applicant's own circumstances.
 */
export function unconditionalRequiredNotApplicable(items: ReadinessItem[]): ReadinessItem[] {
  return items.filter(
    (i) => i.status === "required" && !i.condition && i.progress === "not_applicable"
  );
}
