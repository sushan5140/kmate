import type { SavedApplicationStore } from "./schema";
import { createEmptyStore } from "./model";

export const SAVED_APPLICATIONS_STORAGE_KEY = "kmate:saved-applications:v1";

export function parseSavedApplicationStore(raw: string | null): SavedApplicationStore {
  if (!raw) return createEmptyStore();
  try {
    const parsed = JSON.parse(raw) as Partial<SavedApplicationStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.applications) || !(parsed.activeApplicationId === null || typeof parsed.activeApplicationId === "string")) {
      return createEmptyStore();
    }
    return parsed as SavedApplicationStore;
  } catch {
    return createEmptyStore();
  }
}
