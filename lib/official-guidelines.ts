import type { Track } from "@/lib/constants";

export interface OfficialGuideline {
  track: Track;
  title: string;
  description: string;
  url: string;
}

/**
 * NIIED republishes these application-guideline PDFs at new URLs each
 * cycle -- this list needs a manual update when that happens, same caveat
 * already noted for the university list, mistake-data seeds, and deadline
 * estimates elsewhere in this codebase.
 */
export const OFFICIAL_GUIDELINES: Record<Track, OfficialGuideline> = {
  gks_u: {
    track: "gks_u",
    title: "GKS-U 2026 Application Guidelines",
    description:
      "Official NIIED application guidelines for the 2026 Global Korea Scholarship — Undergraduate track.",
    url: "https://gksscholarship.com/wp-content/uploads/2025/09/Global-Korea-Scholarship-2026-Application-Guidelines.pdf",
  },
  gks_g: {
    track: "gks_g",
    title: "GKS-G 2026 Application Guidelines",
    description: "Official NIIED application guidelines for the 2026 Global Korea Scholarship — Graduate track.",
    url: "https://gksscholarship.com/wp-content/uploads/2026/02/2026-GKS-G-Application-Guidelines-English.pdf",
  },
};
