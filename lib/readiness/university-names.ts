/**
 * Reconciles university names between the two lists KMate already holds.
 *
 * `public.universities` (seeded from data/gks-universities.json, which
 * onboarding writes `university_choices` against) and
 * data/requirement-checker-data.json were compiled from different NIIED pages
 * and disagree on some names -- mostly acronym-order flips like "POSTECH
 * (Pohang University of Science and Technology)" against "Pohang University of
 * Science and Technology (POSTECH)".
 *
 * Resolution is exact matching plus an explicit alias table, and nothing else.
 * There is deliberately no fuzzy or normalising pass: the cost of a wrong match
 * is one university's verified requirements displayed under another
 * university's name, and a rule loose enough to catch "Hanyang University
 * (Seoul)" is loose enough to catch "Hanyang University (ERICA)" with it. Every
 * pairing below was checked by hand against both datasets, so each one can be
 * audited on its own line rather than inferred from a similarity score.
 *
 * A name with no exact match and no alias resolves to null. That is the correct
 * answer for the several universities NIIED lists as GKS participants but for
 * which KMate holds no verified requirement record -- they are reported to the
 * applicant as having no record available, never given guessed requirements.
 */

/**
 * Profile-side name -> the canonical name used by the requirement dataset.
 *
 * Keys are exactly as they appear in data/gks-universities.json; values exactly
 * as they appear in data/requirement-checker-data.json. Neither file is
 * modified to make a pairing work.
 */
const ALIASES: Record<string, string> = {
  // --- acronym-order flips: same institution, acronym leading rather than trailing ---
  "DGIST (Daegu Gyeongbuk Institute of Science and Technology)":
    "Daegu Gyeongbuk Institute of Science and Technology (DGIST)",
  "GIST (Gwangju Institute of Science and Technology)":
    "Gwangju Institute of Science and Technology (GIST)",
  "KAIST (Korea Advanced Institute of Science and Technology)":
    "Korea Advanced Institute of Science and Technology (KAIST)",
  "KOREATECH (Korea University of Technology and Education)":
    "Korea University of Technology and Education (KOREATECH)",
  "POSTECH (Pohang University of Science and Technology)":
    "Pohang University of Science and Technology (POSTECH)",
  "UNIST (Ulsan National Institute of Science and Technology)":
    "Ulsan National Institute of Science and Technology (UNIST)",

  // --- hyphenation ---
  "Dong Eui Institute of Technology": "Dong-Eui Institute of Technology",

  // --- acronym present on one side only ---
  "Hankuk University of Foreign Studies": "Hankuk University of Foreign Studies (HUFS)",

  // Hanyang's main campus. The requirement dataset names it plainly and lists
  // ERICA as a separate university; the profile list qualifies the main campus
  // as "(Seoul)". Both of the dataset's own names already match exactly, so
  // this alias adds the third spelling without touching either.
  "Hanyang University (Seoul)": "Hanyang University",

  // --- fuller legal names on the requirement side ---
  // The requirement record is filed under the graduate school's full title.
  // Resolving the alias only identifies the record; it does not change what
  // that record says -- AKS is marked excluded, and stays excluded.
  "The Academy of Korean Studies": "The Graduate School of Korean Studies, The Academy of Korean Studies",
  "NCC-GCSP (National Cancer Center Graduate School of Cancer Science and Policy)":
    "National Cancer Center Graduate School",
};

export interface NameResolver {
  /** The requirement-dataset name for `name`, or null when there is no verified record. */
  resolve(name: string): string | null;
}

/** Builds a resolver over the requirement dataset's own university names. */
export function createNameResolver(requirementUniversities: string[]): NameResolver {
  const known = new Set(requirementUniversities);

  return {
    resolve(name: string): string | null {
      const trimmed = name.trim();
      if (known.has(trimmed)) return trimmed;

      const canonical = ALIASES[trimmed];
      // Fails closed: if the requirement dataset ever renames one of these, the
      // alias stops resolving rather than pointing at a university that is no
      // longer there.
      return canonical && known.has(canonical) ? canonical : null;
    },
  };
}

/** The alias table, for the checks to assert against. */
export const UNIVERSITY_NAME_ALIASES: Readonly<Record<string, string>> = ALIASES;
