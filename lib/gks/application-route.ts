import type {
  GksUApplicationRoute,
  GksUEmbassyPath,
} from "@/lib/constants";

export const GKS_U_UNIVERSITY_TRACK_CATEGORIES = new Set([
  "uic_bachelors",
  "associate_degree",
]);

export const GKS_U_EMBASSY_CATEGORIES = new Set([
  "embassy_type_a",
  "embassy_type_b_rgks",
]);

export function resolveGksUApplicationRoute(
  embassyPath: GksUEmbassyPath | null,
  categories: readonly (string | null | undefined)[]
): GksUApplicationRoute | null {
  if (embassyPath) return "embassy";

  const meaningful = categories.filter((value): value is string => Boolean(value));
  if (
    meaningful.length > 0 &&
    meaningful.every((category) => GKS_U_UNIVERSITY_TRACK_CATEGORIES.has(category))
  ) {
    return "university";
  }

  return null;
}

export function gksURouteLabel(
  route: GksUApplicationRoute | null,
  embassyPath: GksUEmbassyPath | null
): string {
  if (route === "university") return "University Track";
  if (route === "embassy" && embassyPath === "r_gks") return "Embassy Track · R-GKS";
  if (route === "embassy" && embassyPath === "general_overseas") {
    return "Embassy Track · General / Overseas Korean";
  }
  return "Route not selected";
}
