/**
 * Display aliases for imported community contributors.
 *
 * The community corpus was anonymised at ingestion: every answer carries a
 * `sender_alias` like "user_995e4461b2" and nothing else -- no phone number,
 * no handle, no real name. That pseudonym is stable per contributor (813 of
 * them across ~22.8k answers), which is what makes a *consistent* display
 * alias possible: the same person reads as the same "Hana K." everywhere,
 * without KMate ever holding an identity to leak.
 *
 * These names are openly synthetic. They are a readability device so a thread
 * of replies has distinguishable voices instead of five identical "Community
 * member" rows -- they are never presented as the contributor's real name,
 * and no scholar status or credential is ever attached to them.
 */

// Deliberately international: GKS applicants come from everywhere, and a pool
// of only Korean-style names would imply something about who these people are
// that the data does not support.
const GIVEN_NAMES = [
  "Hana", "Min", "Sora", "Jin", "Yuna", "Tae", "Bo", "Nari",
  "Aisha", "Omar", "Layla", "Yusuf", "Zara", "Karim", "Amina", "Tariq",
  "Arjun", "Priya", "Rohan", "Divya", "Kiran", "Neha", "Vikram", "Anjali",
  "Linh", "Minh", "Thao", "Duc", "Mai", "Nam", "Trang", "Quan",
  "Aigerim", "Timur", "Aliya", "Nurlan", "Dana", "Ruslan", "Gulnara", "Askar",
  "Chidi", "Ngozi", "Kwame", "Amara", "Tunde", "Zola", "Kofi", "Nadia",
  "Sofia", "Mateo", "Camila", "Diego", "Valentina", "Andres", "Lucia", "Pablo",
  "Elena", "Ivan", "Katya", "Marek", "Ana", "Petar", "Irina", "Luka",
  "Maya", "Rafi", "Sana", "Bilal", "Farah", "Hamza", "Iman", "Zaid",
  "Ye-jin", "Joon", "Seo-yeon", "Hyun", "Ji-woo", "Eun", "Do-yun", "Chae",
] as const;

const INITIALS = "ABCDEFGHIJKLMNOPRSTVWYZ";

/** FNV-1a. Small, dependency-free, and stable across runtimes -- which is the
 *  only property that matters here: the same input must map to the same alias
 *  on the server, in the browser, and next year. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The stable alias for one contributor, e.g. "Hana K.".
 *
 * The two components are drawn from independently-salted hashes so that
 * contributors sharing a given name don't also tend to share an initial.
 */
export function communityAlias(senderAlias: string): string {
  const given = GIVEN_NAMES[hash(senderAlias) % GIVEN_NAMES.length];
  const initial = INITIALS[hash(`${senderAlias}#surname`) % INITIALS.length];
  return `${given} ${initial}.`;
}

/**
 * Aliases for a set of contributors shown together, guaranteed distinct.
 *
 * `communityAlias` alone can collide -- ~1.8k combinations against 813
 * contributors -- and two different people rendered as the same name on one
 * page reads as one person contradicting themselves. Collisions are broken
 * here, at render time, by adding a second initial, rather than by widening
 * the pool (which cannot eliminate collisions, only make them rarer).
 *
 * Ordering matters: pass contributors in a stable order (the order they are
 * displayed in) so the disambiguated form is stable too.
 */
export function communityAliases(senderAliases: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();

  for (const sender of senderAliases) {
    if (out.has(sender)) continue;

    const base = communityAlias(sender);
    let alias = base;
    // "Hana K." -> "Hana K.B." -> "Hana K.C." ... Deterministic per (sender,
    // attempt), so the same collision resolves the same way every render.
    for (let attempt = 0; taken.has(alias); attempt++) {
      const extra = INITIALS[hash(`${sender}#${attempt}`) % INITIALS.length];
      alias = `${base}${extra}.`;
    }
    taken.add(alias);
    out.set(sender, alias);
  }

  return out;
}
