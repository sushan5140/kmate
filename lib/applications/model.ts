import type { SavedApplication, SavedApplicationStore, SavedUniversityChoice } from "./schema";

export function canonicalUniversityId(name: string): string {
  return name.normalize("NFKC").trim().toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function normalizeUniversityChoices(input: Array<{ name: string; major?: string }>): SavedUniversityChoice[] {
  const seen = new Set<string>();
  const out: SavedUniversityChoice[] = [];
  for (const item of input) {
    const name = item.name.trim();
    if (!name) continue;
    const id = canonicalUniversityId(name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, major: item.major?.trim() || undefined, priority: out.length + 1 });
  }
  return out;
}

export function createSavedApplication(input: {
  program: SavedApplication["program"];
  track: SavedApplication["track"];
  subtype?: string;
  universities?: Array<{ name: string; major?: string }>;
  now?: Date;
}): SavedApplication {
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  return {
    id: `gks-app-${iso.replace(/[-:.TZ]/g, "")}`,
    version: 1,
    status: "active",
    program: input.program,
    track: input.track,
    subtype: input.subtype?.trim() || undefined,
    universities: normalizeUniversityChoices(input.universities ?? []),
    createdAt: iso,
    updatedAt: iso
  };
}

export function createEmptyStore(): SavedApplicationStore {
  return { version: 1, activeApplicationId: null, applications: [] };
}

export function upsertApplication(store: SavedApplicationStore, application: SavedApplication): SavedApplicationStore {
  const applications = store.applications.some(a => a.id === application.id)
    ? store.applications.map(a => a.id === application.id ? application : a)
    : [...store.applications, application];
  return { version: 1, activeApplicationId: application.status === "active" ? application.id : store.activeApplicationId, applications };
}

export function archiveApplication(store: SavedApplicationStore, applicationId: string): SavedApplicationStore {
  return {
    ...store,
    activeApplicationId: store.activeApplicationId === applicationId ? null : store.activeApplicationId,
    applications: store.applications.map(app => app.id === applicationId ? { ...app, status: "archived", updatedAt: new Date().toISOString() } : app)
  };
}
