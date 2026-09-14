export const GKS_RULE_BOOKMARKS_KEY = "kmate:gks-u-2027-saved-rules";

export interface SavedGksRule {
  id: string;
  title: string;
  text: string;
  page?: string | null;
  sourceUrl?: string | null;
  savedAt: string;
  kind: "guideline_rule" | "ai_answer";
  question?: string | null;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readSavedGksRules(): SavedGksRule[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(GKS_RULE_BOOKMARKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedGksRule =>
        Boolean(item) &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.text === "string" &&
        typeof item.savedAt === "string"
    );
  } catch {
    return [];
  }
}

export function isGksRuleSaved(id: string) {
  return readSavedGksRules().some((item) => item.id === id);
}

export function saveGksRule(
  input: Omit<SavedGksRule, "savedAt"> & { savedAt?: string }
): SavedGksRule[] {
  if (!canUseStorage()) return [];
  const existing = readSavedGksRules().filter((item) => item.id !== input.id);
  const next: SavedGksRule[] = [
    {
      ...input,
      savedAt: input.savedAt ?? new Date().toISOString(),
    },
    ...existing,
  ].slice(0, 100);
  window.localStorage.setItem(GKS_RULE_BOOKMARKS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("kmate:gks-rules-changed"));
  return next;
}

export function removeGksRule(id: string): SavedGksRule[] {
  if (!canUseStorage()) return [];
  const next = readSavedGksRules().filter((item) => item.id !== id);
  window.localStorage.setItem(GKS_RULE_BOOKMARKS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("kmate:gks-rules-changed"));
  return next;
}

export function toggleGksRule(
  input: Omit<SavedGksRule, "savedAt"> & { savedAt?: string }
): { saved: boolean; items: SavedGksRule[] } {
  if (isGksRuleSaved(input.id)) {
    return { saved: false, items: removeGksRule(input.id) };
  }
  return { saved: true, items: saveGksRule(input) };
}
