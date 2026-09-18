import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requirementDataset } from "@/lib/requirements";
import { createNameResolver } from "./university-names";
import { resolveGksUApplicationRoute } from "@/lib/gks/application-route";
import type { GksUEmbassyPath } from "@/lib/constants";

/**
 * Readiness defaults taken from the applicant's existing KMate profile.
 *
 * Only fields the app actually stores are used, and each is used for the thing
 * it literally records -- nothing is inferred from unrelated data:
 *
 *   profiles.track              -> GKS-U / GKS-G
 *   profiles.gks_u_embassy_path + selected eligibility -> explicit GKS-U route
 *   profiles.major              -> the default department for each slot
 *   university_choices          -> the selected universities, in priority order
 *
 * Deliberately NOT derived:
 *   - A GKS-U route from ambiguous/mixed legacy eligibility rows. University
 *     Track is prefilled only when the saved choices are explicitly current
 *     UIC/Associate eligibility rows; otherwise the route stays blank.
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
  eligibility: { category: string } | null;
}

export async function getProfileDefaults(userId: string): Promise<ProfileDefaults> {
  const { data } = await getSupabaseAdmin()
    .from("profiles")
    .select(
      `track, gks_u_embassy_path, major,
       university_choices (
         priority,
         university:universities ( name ),
         eligibility:university_eligibility ( category )
       )`
    )
    .eq("id", userId)
    .maybeSingle();

  // No row, or onboarding never filled these in: readiness still works, just
  // with nothing prefilled.
  if (!data) return NO_DEFAULTS;

  const program = data.track === "gks_u" ? "GKS-U" : data.track === "gks_g" ? "GKS-G" : "";

  const rows = ((data.university_choices ?? []) as unknown as ChoiceRow[])
    .slice()
    .sort((a, b) => a.priority - b.priority);

  let track = "";
  let subtype = "";
  if (program === "GKS-U") {
    const route = resolveGksUApplicationRoute(
      data.gks_u_embassy_path as GksUEmbassyPath | null,
      rows.map((row) => row.eligibility?.category)
    );
    if (route === "embassy") {
      track = "embassy";
      subtype = data.gks_u_embassy_path === "r_gks" ? "r_gks" : "general";
    } else if (route === "university") {
      track = "university";
      const category = rows[0]?.eligibility?.category;
      subtype = category === "uic_bachelors" ? "uic" : category === "associate_degree" ? "associate" : "";
    }
  }

  const resolver = createNameResolver(
    requirementDataset.records
      .filter((record) => !program || record.program === program)
      .map((record) => record.university)
  );
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
