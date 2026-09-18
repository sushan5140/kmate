import type { GksUApplicationRoute, GksUEmbassyPath, Track } from "@/lib/constants";
import { GKS_U_UNIVERSITY_TRACK_CATEGORIES } from "@/lib/gks/application-route";

export interface UniversityChoiceForValidation {
  category: string; // e.g. 'embassy_type_a', 'uic_bachelors', 'type_b'
  embassyType: "type_a" | "type_b" | null;
}

export interface EligibilityValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Official selection caps only. KMate must never add a "bonus" university
 * beyond the limit stated by the GKS guideline.
 *
 * GKS-U 2027:
 * - Embassy General / Overseas Koreans & Adoptees: up to 3, >=1 Type B.
 * - Embassy R-GKS: up to 2, all Type B.
 * - University Track (UIC / Associate): 1 university.
 *
 * GKS-G keeps the current official Embassy cap encoded by KMate: up to 3.
 */
export const OFFICIAL_UNIVERSITY_QUOTA: Record<
  "gks_g" | "general_overseas" | "r_gks" | "gks_u_university",
  number
> = {
  gks_g: 3,
  general_overseas: 3,
  r_gks: 2,
  gks_u_university: 1,
};

export function maxUniversityChoices(
  track: Track,
  gksUEmbassyPath: GksUEmbassyPath | null,
  gksUApplicationRoute: GksUApplicationRoute | null = null
): number {
  if (track === "gks_g") return OFFICIAL_UNIVERSITY_QUOTA.gks_g;
  if (gksUApplicationRoute === "university") return OFFICIAL_UNIVERSITY_QUOTA.gks_u_university;
  if (gksUEmbassyPath === "r_gks") return OFFICIAL_UNIVERSITY_QUOTA.r_gks;
  if (gksUEmbassyPath === "general_overseas") {
    return OFFICIAL_UNIVERSITY_QUOTA.general_overseas;
  }
  return OFFICIAL_UNIVERSITY_QUOTA.gks_u_university;
}

export function validateUniversityChoices(
  track: Track,
  gksUEmbassyPath: GksUEmbassyPath | null,
  choices: UniversityChoiceForValidation[],
  gksUApplicationRoute: GksUApplicationRoute | null = null
): EligibilityValidationResult {
  if (choices.length < 1) {
    return { valid: false, message: "Pick at least 1 university." };
  }

  const cap = maxUniversityChoices(track, gksUEmbassyPath, gksUApplicationRoute);
  if (choices.length > cap) {
    return {
      valid: false,
      message:
        track === "gks_u" && gksUApplicationRoute === "university"
          ? "GKS-U University Track allows only 1 university."
          : `You can pick at most ${cap} universit${cap === 1 ? "y" : "ies"} for this route.`,
    };
  }

  if (track === "gks_g") {
    return { valid: true };
  }

  if (gksUApplicationRoute === "university") {
    if (!choices.every((choice) => GKS_U_UNIVERSITY_TRACK_CATEGORIES.has(choice.category))) {
      return {
        valid: false,
        message: "Choose a university listed for the GKS-U University Track (UIC or Associate Degree).",
      };
    }
    return { valid: true };
  }

  if (gksUApplicationRoute === "embassy" && !gksUEmbassyPath) {
    return { valid: false, message: "Choose the Embassy Track route: General / Overseas Korean or R-GKS." };
  }

  if (gksUEmbassyPath === "r_gks") {
    const allTypeB = choices.every((c) => c.embassyType === "type_b");
    if (!allTypeB) {
      return {
        valid: false,
        message: "R-GKS applicants must choose universities that are all Type B.",
      };
    }
    return { valid: true };
  }

  if (gksUEmbassyPath === "general_overseas") {
    const hasTypeB = choices.some((c) => c.embassyType === "type_b");
    if (!hasTypeB) {
      return { valid: false, message: "Include at least 1 Type B university." };
    }
    return { valid: true };
  }

  // Backward-compatible fallback for legacy callers that do not yet pass the
  // explicit route. A null embassy path is treated as University Track only
  // when every selected eligibility row is a University Track row.
  if (
    gksUApplicationRoute === null &&
    gksUEmbassyPath === null &&
    choices.every((choice) => GKS_U_UNIVERSITY_TRACK_CATEGORIES.has(choice.category))
  ) {
    return { valid: true };
  }

  return { valid: false, message: "Choose your GKS-U application route before selecting universities." };
}

/** Track-aware helper text using only the official limits KMate enforces. */
export function describeUniversityQuota(
  track: Track,
  gksUEmbassyPath: GksUEmbassyPath | null,
  gksUApplicationRoute: GksUApplicationRoute | null = null
): string {
  if (track === "gks_g") {
    return `Official cap: up to ${OFFICIAL_UNIVERSITY_QUOTA.gks_g} universities.`;
  }
  if (gksUApplicationRoute === "university") {
    return "University Track: 1 university only; choose a current UIC or Associate Degree institution.";
  }
  if (gksUEmbassyPath === "r_gks") {
    return `R-GKS: up to ${OFFICIAL_UNIVERSITY_QUOTA.r_gks} universities, all Type B.`;
  }
  if (gksUEmbassyPath === "general_overseas") {
    return `Embassy General / Overseas: up to ${OFFICIAL_UNIVERSITY_QUOTA.general_overseas} universities, with at least 1 Type B.`;
  }
  return "University Track: 1 university only; choose a current UIC or Associate Degree institution.";
}
