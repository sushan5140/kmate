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
    if (choices.length > 3) {
      return { valid: false, message: "GKS-G applicants can pick up to 3 universities." };
    }
    return { valid: true };
  }

  // track === 'gks_u'
  if (gksUEmbassyPath === "r_gks") {
    if (choices.length > 2) {
      return {
        valid: false,
        message: "R-GKS applicants can pick up to 2 universities, both Type B.",
      };
    }
    const allTypeB = choices.every((c) => c.embassyType === "type_b");
    if (!allTypeB) {
      return {
        valid: false,
        message: "R-GKS applicants must choose universities that are both Type B.",
      };
    }
    return { valid: true };
  }

  if (gksUEmbassyPath === "general_overseas") {
    if (choices.length > 3) {
      return {
        valid: false,
        message: "General/Overseas Korean applicants can pick up to 3 universities.",
      };
    }
    const hasTypeB = choices.some((c) => c.embassyType === "type_b");
    if (!hasTypeB) {
      return { valid: false, message: "Include at least 1 Type B university." };
    }
    return { valid: true };
  }

  // No embassy path chosen (e.g. applying via the direct-to-university
  // UIC/associate-degree track) -- just enforce the general 1-4 cap.
  return { valid: true };
}
