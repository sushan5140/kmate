import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requirementDataset } from "@/lib/requirements";
import { createNameResolver } from "./university-names";

/**
 * Readiness defaults taken from the applicant's existing KMate profile.
 *
 * Only fields the app actually stores are used, and each is used for the thing
 * it literally records -- nothing is inferred from unrelated data:
 *
 *   profiles.track              -> GKS-U / GKS-G
 *   profiles.gks_u_embassy_path -> Embassy Track, General or R-GKS
 *   profiles.major              -> the default department for each slot
 *   university_choices          -> the selected universities, in priority order
 *
 * Deliberately NOT derived:
 *   - The track for a GKS-G applicant, and for a GKS-U applicant with no
 *     embassy path stored. `university_eligibility.category` hints at it, but a
 *     profile can hold choices from several categories at once, so reading a
 *     route out of it would be a guess. Those applicants pick the track
 *     themselves, once.
 *   - Anything about language ability, nationality, grades or graduation
 *     status: KMate stores none of it, and readiness does not ask for it,
 *     because the requirement dataset has no structured rule that could use it
 *     (all 184 records carry language information as prose only).
 *
 * These are defaults, not commitments. The workspace lets the applicant change
 * any of them for this application, and nothing here ever writes back to the
 * profile.
 */

export interface ProfileDefaults {
  program: string;
  track: string;
  subtype: string;
  major: string;
  /** Requirement-dataset names, in the applicant's own priority order. */
  universities: string[];
  /** Which of the fields above actually came from the profile. */
  from: { program: boolean; track: boolean; major: boolean; universities: boolean };
  /**
   * Saved university choices whose names could not be matched to a requirement
   * record. Surfaced so the applicant is told rather than silently short-changed.
   */
  unresolvedUniversities: string[];
}

export const NO_DEFAULTS: ProfileDefaults = {
  program: "",
  track: "",
  subtype: "",
  major: "",
  universities: [],
  from: { program: false, track: false, major: false, universities: false },
  unresolvedUniversities: [],
};

interface ChoiceRow {
  priority: number;
  university: { name: string } | null;
}

export async function getProfileDefaults(userId: string): Promise<ProfileDefaults> {
  const { data } = await getSupabaseAdmin()
    .from("profiles")
    .select(
      `track, gks_u_embassy_path, major,
       university_choices ( priority, university:universities ( name ) )`
    )
    .eq("id", userId)
    .maybeSingle();

  // No row, or onboarding never filled these in: readiness still works, just
  // with nothing prefilled.
  if (!data) return NO_DEFAULTS;

  const program = data.track === "gks_u" ? "GKS-U" : data.track === "gks_g" ? "GKS-G" : "";

  // gks_u_embassy_path records which embassy route the applicant chose, so it
  // maps straight onto the Requirement Checker hierarchy. A null value means
  // they are not on the embassy route (or never said), which is left blank.
  let track = "";
  let subtype = "";
  if (program === "GKS-U" && data.gks_u_embassy_path === "general_overseas") {
    track = "embassy";
    subtype = "general";
  } else if (program === "GKS-U" && data.gks_u_embassy_path === "r_gks") {
    track = "embassy";
    subtype = "r_gks";
  }

  const resolver = createNameResolver(requirementDataset.records.map((r) => r.university));
  const rows = ((data.university_choices ?? []) as unknown as ChoiceRow[])
    .slice()
    .sort((a, b) => a.priority - b.priority);

  const universities: string[] = [];
  const unresolvedUniversities: string[] = [];
  for (const row of rows) {
    const name = row.university?.name;
    if (!name) continue;
    const resolved = resolver.resolve(name);
    if (resolved && !universities.includes(resolved)) universities.push(resolved);
    else if (!resolved) unresolvedUniversities.push(name);
  }

  const major = typeof data.major === "string" ? data.major : "";

  return {
    program,
    track,
    subtype,
    major,
    universities,
    from: {
      program: Boolean(program),
      track: Boolean(track),
      major: Boolean(major),
      universities: universities.length > 0,
    },
    unresolvedUniversities,
  };
}
