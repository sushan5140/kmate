import type { EmbassyType } from "@/lib/constants";

/**
 * `gks_university_stats.university` is free text and deliberately does NOT
 * foreign-key into `universities` -- per supabase/schema.sql, "this dataset's
 * coverage of institution names isn't guaranteed to line up with that
 * table's". So Type A / Type B, which lives on `university_eligibility`, has
 * to be matched back onto the stats names by hand. The two lists disagree in
 * three predictable ways:
 *
 *   spacing   "KyungHee University"      vs "Kyung Hee University"
 *   suffix    "Sungkyunkwan University"  vs "Sungkyunkwan University (SKKU)"
 *   inversion "Korea Advanced Institute of Science and Technology(KAIST)"
 *                                        vs "KAIST (Korea Advanced Institute...)"
 *
 * Hence: strip case/punctuation/whitespace entirely, and index each name
 * three ways -- whole, parenthetical removed, and by the parenthetical's own
 * contents. That resolves 69/74 GKS-G and 45/54 GKS-U stat universities. The
 * remainder are either typos carried over from NIIED's source PDFs ("Yonsei
 * Univesity") or associate-degree colleges that carry no embassy type at all,
 * and they simply get no badge -- never a guessed one.
 */

/** Case-, spacing- and punctuation-insensitive form. "Kyung Hee Univ." -> "kyungheeuniv" */
function squash(value: string): string {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

/** Every key a single university name should be findable under. */
export function universityNameKeys(name: string): string[] {
  const keys = new Set<string>();
  keys.add(squash(name));
  keys.add(squash(name.replace(/\([^)]*\)/g, " ")));
  for (const inner of name.matchAll(/\(([^)]*)\)/g)) {
    // Guard against noise like "(Seoul)" colliding with a real institution --
    // only acronyms/names of a reasonable length are worth indexing.
    if (inner[1].trim().length > 3) keys.add(squash(inner[1]));
  }
  keys.delete("");
  return [...keys];
}

export interface EmbassyTypeSource {
  name: string;
  embassyType: EmbassyType;
}

/**
 * Resolves Type A / Type B for each name in `statUniversityNames`, given the
 * `universities`-table rows for the same track. Names with no confident match
 * are absent from the result rather than defaulted.
 */
export function resolveEmbassyTypes(
  statUniversityNames: readonly string[],
  sources: readonly EmbassyTypeSource[]
): Record<string, EmbassyType> {
  const index = new Map<string, EmbassyType>();
  for (const source of sources) {
    for (const key of universityNameKeys(source.name)) {
      // First writer wins: a full-name key is more trustworthy than the
      // parenthetical-derived key of some other university that collides.
      if (!index.has(key)) index.set(key, source.embassyType);
    }
  }

  const resolved: Record<string, EmbassyType> = {};
  for (const statName of statUniversityNames) {
    for (const key of universityNameKeys(statName)) {
      const hit = index.get(key);
      if (hit) {
        resolved[statName] = hit;
        break;
      }
    }
  }
  return resolved;
}
