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

function sortRules(items: SavedGksRule[]) {
  return [...items].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
}

function validRule(item: unknown): item is SavedGksRule {
  if (!item || typeof item !== "object") return false;
  const rule = item as Partial<SavedGksRule>;
  return (
    typeof rule.id === "string" &&
    typeof rule.title === "string" &&
    typeof rule.text === "string" &&
    typeof rule.savedAt === "string" &&
    (rule.kind === "guideline_rule" || rule.kind === "ai_answer")
  );
}

export function writeSavedGksRules(items: SavedGksRule[]): SavedGksRule[] {
  if (!canUseStorage()) return [];
  const byId = new Map<string, SavedGksRule>();
  for (const item of sortRules(items)) {
    if (!validRule(item) || byId.has(item.id)) continue;
    byId.set(item.id, item);
    if (byId.size >= 100) break;
  }
  const next = [...byId.values()];
  window.localStorage.setItem(GKS_RULE_BOOKMARKS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("kmate:gks-rules-changed"));
  return next;
}

export function readSavedGksRules(): SavedGksRule[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(GKS_RULE_BOOKMARKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validRule).slice(0, 100);
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
  const existing = readSavedGksRules().filter((item) => item.id !== input.id);
  return writeSavedGksRules([
    {
      ...input,
      savedAt: input.savedAt ?? new Date().toISOString(),
    },
    ...existing,
  ]);
}

export function removeGksRule(id: string): SavedGksRule[] {
  return writeSavedGksRules(readSavedGksRules().filter((item) => item.id !== id));
}

export function toggleGksRule(
  input: Omit<SavedGksRule, "savedAt"> & { savedAt?: string }
): { saved: boolean; items: SavedGksRule[] } {
  if (isGksRuleSaved(input.id)) {
    return { saved: false, items: removeGksRule(input.id) };
  }
  return { saved: true, items: saveGksRule(input) };
}

export function mergeSavedGksRules(
  local: SavedGksRule[],
  remote: SavedGksRule[]
): SavedGksRule[] {
  const byId = new Map<string, SavedGksRule>();
  for (const item of [...local, ...remote]) {
    if (!validRule(item)) continue;
    const existing = byId.get(item.id);
    if (!existing || Date.parse(item.savedAt) > Date.parse(existing.savedAt)) {
      byId.set(item.id, item);
    }
  }
  return sortRules([...byId.values()]).slice(0, 100);
}

export async function fetchAccountSavedGksRules(): Promise<SavedGksRule[] | null> {
  try {
    const response = await fetch("/api/gks/saved-rules", { cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as { items?: unknown };
    if (!Array.isArray(payload.items)) return [];
    return payload.items.filter(validRule).slice(0, 100);
  } catch {
    return null;
  }
}

export async function pushAccountSavedGksRules(items: SavedGksRule[]): Promise<boolean> {
  try {
    const response = await fetch("/api/gks/saved-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items.slice(0, 100) }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Pull account bookmarks, merge with the browser cache, then write the merged
 * list back to both. This makes localStorage an offline cache instead of the
 * source of truth, while keeping the feature usable if account sync is down.
 */
export async function reconcileSavedGksRules(): Promise<SavedGksRule[]> {
  const local = readSavedGksRules();
  const remote = await fetchAccountSavedGksRules();
  if (remote === null) return local;
  const merged = writeSavedGksRules(mergeSavedGksRules(local, remote));
  void pushAccountSavedGksRules(merged);
  return merged;
}
