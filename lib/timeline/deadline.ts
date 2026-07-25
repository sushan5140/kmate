import type { Track } from "@/lib/constants";

/**
 * Onboarding only collects an intake year, not a real GKS notice/deadline
 * date -- these are rough historical-cycle approximations (GKS-G notices
 * typically open ~Feb-Mar, GKS-U ~Sept-Oct the prior year), NOT an official
 * deadline. This is a hardcoded estimate, not pulled from an authoritative
 * NIIED source -- verify and update each application cycle, same caveat
 * already noted for the university list and mistake data seeds.
 *
 * Shared by the Home hero widget and the Timeline page so both ever only
 * compute this one way.
 */
export function estimateApplicationDeadline(track: Track, applicationYear: number): Date {
  if (track === "gks_g") return new Date(applicationYear, 1, 15); // ~Feb 15 of the intake year
  return new Date(applicationYear - 1, 8, 30); // gks_u: ~Sept 30 of the prior year
}

/**
 * Hand-maintained calendar dates for the upcoming intake cycle, shown as a
 * single banner rather than derived from estimateApplicationDeadline above.
 * GKS-U's embassy deadline is reasonably predictable year to year, but
 * GKS-G's official notice isn't published this far ahead, so it's labeled
 * rather than dated. Same caveat as estimateApplicationDeadline and the
 * university list / mistake-data seeds elsewhere in this codebase: these
 * are estimates/placeholders, not pulled from an authoritative NIIED
 * source -- verify and update at the start of each new cycle.
 */
const GKS_U_PREP_BY_DATE = new Date(2026, 8, 15); // ~Sept 15, 2026
const GKS_U_OFFICIAL_DEADLINE_DATE = new Date(2026, 8, 30); // ~Sept 30, 2026 (embassy deadline estimate)
const GKS_G_PREP_BY_DATE = new Date(2027, 1, 15); // ~Feb 15, 2027

const bannerDateFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

export interface DeadlineBannerCopy {
  prepBy: string;
  official: string;
}

/** Prep-by / official-deadline copy for the calendar banner, by track. */
export function deadlineBannerCopy(track: Track): DeadlineBannerCopy {
  if (track === "gks_g") {
    return {
      prepBy: `Prepare your documents by ${bannerDateFormatter.format(GKS_G_PREP_BY_DATE)}`,
      official: "Official deadline: not yet announced",
    };
  }
  return {
    prepBy: `Prepare your documents by ${bannerDateFormatter.format(GKS_U_PREP_BY_DATE)}`,
    official: `Official embassy deadline: ${bannerDateFormatter.format(GKS_U_OFFICIAL_DEADLINE_DATE)}`,
  };
}

/**
 * Application years a user could reasonably still pick for `track`, i.e.
 * ones whose estimated deadline hasn't already passed. Replaces a flat
 * [currentYear, +1, +2] list that didn't account for GKS-G's deadline
 * (~Feb) or GKS-U's (~Sept of the PRIOR year) already having passed for the
 * nearest intake -- see estimateApplicationDeadline above. A 4-year
 * candidate window is generous headroom so this doesn't come back empty
 * even late in a cycle.
 */
export function validApplicationYears(track: Track): number[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const candidates = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3];
  const years = candidates.filter((year) => estimateApplicationDeadline(track, year) > now);

  // GKS-U 2026 is still open past this estimate's cutoff -- the ~Sept-of-
  // prior-year heuristic above is too conservative for this specific cycle.
  // One-off carve-out for the current cycle, not a change to the deadline
  // math itself: revisit (and likely drop) at the start of the next cycle.
  if (track === "gks_u" && !years.includes(2026)) {
    years.unshift(2026);
  }

  return years;
}
