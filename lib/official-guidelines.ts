import type { Track } from "@/lib/constants";

export interface OfficialGuideline {
  /** Stable slug -- used as the React key and to address a specific entry from the download-proxy route. */
  id: string;
  track: Track;
  title: string;
  description: string;
  /** Either an absolute external URL (proxied through /api/official-guidelines/download for a forced download) or a same-origin /public path (downloads natively via the `download` attribute). */
  url: string;
  /** Only set when a track has more than one published version (currently GKS-U's pre/post-NIRS-fire revision) -- shown as a small badge on the card. Omitted for tracks with a single, unambiguous version. */
  versionLabel?: string;
}

/**
 * NIIED republishes these application-guideline PDFs at new URLs each
 * cycle -- this list needs a manual update when that happens, same caveat
 * already noted for the university list, mistake-data seeds, and deadline
 * estimates elsewhere in this codebase.
 *
 * GKS-U has two entries because NIIED issued an emergency revision
 * mid-cycle -- see GKS_U_REVISION_NOTE below for why. Both PDFs are
 * mirrored under /public/official-guidelines/ (this project has no
 * existing Supabase Storage bucket, and /public already matches how other
 * static reference data -- data/gks-universities.json etc -- is committed
 * directly rather than fetched from an external host). GKS-G's guideline
 * has a live public URL and stays linked directly.
 */
export const OFFICIAL_GUIDELINES: Record<Track, OfficialGuideline[]> = {
  gks_u: [
    {
      id: "gks-u-2026-original",
      track: "gks_u",
      title: "GKS-U 2026 Application Guidelines (Original)",
      description:
        "Official NIIED application guidelines for the 2026 Global Korea Scholarship — Undergraduate track, as originally published.",
      url: "/official-guidelines/gks-u-2026-original.pdf",
      versionLabel: "Original — Sept 2025",
    },
    {
      id: "gks-u-2026-revised",
      track: "gks_u",
      title: "GKS-U 2026 Application Guidelines (Revised)",
      description:
        "Official NIIED application guidelines for the 2026 Global Korea Scholarship — Undergraduate track, revised after the October 2025 NIRS fire.",
      url: "/official-guidelines/gks-u-2026-revised.pdf",
      versionLabel: "Revised — Oct 2025",
    },
  ],
  gks_g: [
    {
      id: "gks-g-2026",
      track: "gks_g",
      title: "GKS-G 2026 Application Guidelines",
      description: "Official NIIED application guidelines for the 2026 Global Korea Scholarship — Graduate track.",
      url: "https://gksscholarship.com/wp-content/uploads/2026/02/2026-GKS-G-Application-Guidelines-English.pdf",
    },
  ],
};

export interface GuidelineDifference {
  /** Page number as printed in each PDF's own footer, so it matches what a user sees in their viewer -- a string since some entries span a range (e.g. "9–10"). */
  page: string;
  summary: string;
}

/**
 * Explains why two GKS-U guideline versions exist and exactly where they
 * diverge -- rendered by the collapsed-by-default "See what changed" note
 * on the Official Guidelines page. Hand-verified against both PDFs at the
 * time this was written; if NIIED publishes a further revision, re-diff
 * before reusing this note.
 */
export const GKS_U_REVISION_NOTE = {
  summary:
    "NIIED's Study in Korea online application portal went offline in early October 2025 after a fire at Korea's National Information Resources Service (NIRS) disrupted government systems. Since Embassy Track applicants could no longer submit through that portal, NIIED issued a revised guideline switching Embassy Track submission to direct/offline delivery to embassies and extending the deadline.",
  differences: [
    {
      page: "2",
      summary:
        "University Information source changed from the Study in Korea site (studyinkorea.go.kr) to NIIED's own site (niied.go.kr) — a citation update, not a process change.",
    },
    {
      page: "8",
      summary:
        "The original's full \"Application Method\" section, describing the online Study in Korea submission system, is removed entirely — that method was suspended.",
    },
    {
      page: "9–10",
      summary:
        "Selection schedule shifted: Embassy Track deadline Sept 30 → Oct 17, Embassy Track result Oct 17 → Oct 27, University Track result Nov 14 → Nov 21. The original's online submission time window and its note that Russia doesn't accept online Embassy applications are both gone, consistent with the online system being down.",
    },
    {
      page: "11",
      summary:
        "The \"Documents to Submit\" table drops the original's extra columns for online-system steps and post-first-round actions, using a simpler 3-column table instead.",
    },
    {
      page: "12",
      summary:
        "Application-document submission changes from \"through the online system\" to direct submission, with a simpler original-document requirement.",
    },
    {
      page: "18",
      summary:
        "The \"Evaluation Preference\" list shrinks from 7 items to 5 — missing \"Applicants majoring in fields linked to regional RISE plans\" and \"Applicants recommended by metropolitan or provincial government heads.\" Unconfirmed whether this was a deliberate removal or an unrelated edit.",
    },
  ] satisfies GuidelineDifference[],
  closingNote:
    "Both documents are historical: the 2026 GKS-U application cycle has concluded. They're kept here for reference and transparency, not as an active application procedure.",
};
