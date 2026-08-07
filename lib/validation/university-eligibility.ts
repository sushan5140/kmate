import type { GksUEmbassyPath, Track } from "@/lib/constants";

export interface UniversityChoiceForValidation {
  category: string; // e.g. 'embassy_type_a', 'uic_bachelors', 'type_b'
  embassyType: "type_a" | "type_b" | null;
}

export interface EligibilityValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * NIIED's official embassy-track quotas are GKS-G: 3, General/Overseas: 3,
 * R-GKS (regional): 2 -- all both Type B for R-GKS, >=1 Type B for
 * General/Overseas. KMate grants every embassy-track applicant one bonus
 * pick on top of their official quota (product decision, not a NIIED rule),
 * so the enforced caps here are one higher than the official figures. The
 * direct-to-university (UIC/associate-degree) path has no embassy quota at
 * all, so it's only ever bound by the platform-wide 1-4 cap below.
 */
export const OFFICIAL_UNIVERSITY_QUOTA: Record<"gks_g" | "general_overseas" | "r_gks", number> = {
  gks_g: 3,
  general_overseas: 3,
  r_gks: 2,
};
const BONUS_PICKS = 1;

/**
 * Encodes the PRD's plain-English university-selection rules. This is the
 * most assumption-laden logic in the app: the PRD's rules ("General/Overseas
 * up to 3 w/ >=1 Type B", "R-GKS up to 2 both Type B") imply a GKS-U
 * embassy-path sub-choice that isn't a literal field in the PRD's data
 * model -- modeled here as `gksUEmbassyPath`. Isolated in this one file so
 * a correction, once the real onboarding copy/rules are confirmed, is cheap.
 */
export function validateUniversityChoices(
  track: Track,
  gksUEmbassyPath: GksUEmbassyPath | null,
  choices: UniversityChoiceForValidation[]
): EligibilityValidationResult {
  if (choices.length < 1) {
    return { valid: false, message: "Pick at least 1 university." };
  }
  if (choices.length > 4) {
    return { valid: false, message: "You can pick at most 4 universities." };
  }

  if (track === "gks_g") {
    const cap = OFFICIAL_UNIVERSITY_QUOTA.gks_g + BONUS_PICKS;
    if (choices.length > cap) {
      return { valid: false, message: `GKS-G applicants can pick up to ${cap} universities.` };
    }
    return { valid: true };
  }

  // track === 'gks_u'
  if (gksUEmbassyPath === "r_gks") {
    const cap = OFFICIAL_UNIVERSITY_QUOTA.r_gks + BONUS_PICKS;
    if (choices.length > cap) {
      return {
        valid: false,
        message: `R-GKS applicants can pick up to ${cap} universities, all Type B.`,
      };
    }
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
    const cap = OFFICIAL_UNIVERSITY_QUOTA.general_overseas + BONUS_PICKS;
    if (choices.length > cap) {
      return {
        valid: false,
        message: `General/Overseas Korean applicants can pick up to ${cap} universities.`,
      };
    }
    const hasTypeB = choices.some((c) => c.embassyType === "type_b");
    if (!hasTypeB) {
      return { valid: false, message: "Include at least 1 Type B university." };
    }
    return { valid: true };
  }

  // No embassy path chosen (e.g. applying via the direct-to-university
  // UIC/associate-degree track) -- no embassy quota applies, just the
  // general 1-4 cap.
  return { valid: true };
}

/** Track-aware helper text for the university picker, surfacing the bonus pick explicitly. */
export function describeUniversityQuota(track: Track, gksUEmbassyPath: GksUEmbassyPath | null): string {
  if (track === "gks_g") {
    const official = OFFICIAL_UNIVERSITY_QUOTA.gks_g;
    return `NIIED's official cap is ${official} universities -- KMate gives you ${BONUS_PICKS} bonus pick, so you can choose up to ${official + BONUS_PICKS}.`;
  }
  if (gksUEmbassyPath === "r_gks") {
    const official = OFFICIAL_UNIVERSITY_QUOTA.r_gks;
    return `Regional (R-GKS)'s official cap is ${official} universities, both Type B -- KMate gives you ${BONUS_PICKS} bonus pick, so you can choose up to ${official + BONUS_PICKS} (all Type B).`;
  }
  if (gksUEmbassyPath === "general_overseas") {
    const official = OFFICIAL_UNIVERSITY_QUOTA.general_overseas;
    return `General/Overseas Korean's official cap is ${official} universities -- KMate gives you ${BONUS_PICKS} bonus pick, so you can choose up to ${official + BONUS_PICKS} (at least 1 must be Type B).`;
  }
  return "Applying directly through a university has no embassy quota -- pick up to 4.";
}
