import type { SavedApplication } from "./schema";
import { canonicalUniversityId } from "./model";

export function savedApplicationFromReadiness(input: {
  id?: string;
  program: "GKS-U" | "GKS-G";
  track: "embassy" | "university";
  subtype?: string;
  universities: Array<{ name: string; major?: string }>;
  createdAt?: string;
  now?: Date;
}): SavedApplication {
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  const seen = new Set<string>();
  const universities = input.universities.flatMap((item) => {
    const name = item.name.trim();
    if (!name) return [];
    const id = canonicalUniversityId(name);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, major: item.major?.trim() || undefined, priority: seen.size }];
  });
  return {
    id: input.id ?? `gks-app-${iso.replace(/[-:.TZ]/g, "")}`,
    version: 1,
    status: "active",
    program: input.program,
    track: input.track,
    subtype: input.subtype?.trim() || undefined,
    universities,
    createdAt: input.createdAt ?? iso,
    updatedAt: iso
  };
}
