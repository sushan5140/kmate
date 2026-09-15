import type { Track } from "@/lib/constants";

export interface OfficialGuideline {
  /** Stable slug -- used as the React key and to address a specific entry from the download-proxy route. */
  id: string;
  track: Track;
  title: string;
  description: string;
  /** Direct PDF URL when verified; otherwise the official notice page for the current attachment. */
  url: string;
  /** Defaults to pdf. Use notice when KMate intentionally avoids a stale/unverified direct-PDF mirror. */
  assetType?: "pdf" | "notice";
  /** Optional official notice page that published the PDF. */
  sourceUrl?: string;
  /** Friendly download filename for remote PDFs whose URL does not end in .pdf. */
  downloadFilename?: string;
  /** Marks the edition applicants should use for the currently open cycle. */
  isCurrent?: boolean;
  /** Small status/version badge shown on the card. */
  versionLabel?: string;
}

/**
 * Official guideline PDFs surfaced in KMate.
 *
 * The current 2027 GKS-U English guideline is published by NIIED through Study in Korea.
 * Study in Korea replaced the attachment with the 0914 revision. KMate therefore links
 * the official notice as the source of record instead of pretending an older mirror is
 * the current PDF. A direct PDF link should only be restored after its exact attachment
 * URL/version is verified against the notice.
 *
 * Older GKS-U PDFs remain visible as an archive so applicants can distinguish the
 * current cycle from the 2026 original/revised documents.
 */
export const OFFICIAL_GUIDELINES: Record<Track, OfficialGuideline[]> = {
  gks_u: [
    {
      id: "gks-u-2027",
      track: "gks_u",
      title: "GKS-U 2027 Application Guidelines",
      description:
        "Current official 2027 GKS-U guideline. Study in Korea currently lists the English attachment as the 0914 revision, so KMate opens the official notice instead of serving an older mirrored PDF as current.",
      url:
        "https://www.studyinkorea.go.kr/ko/plan/gksNoticeRead.do?bbsId=BBSMSTR_000000000461&nttId=4522",
      sourceUrl:
        "https://www.studyinkorea.go.kr/ko/plan/gksNoticeRead.do?bbsId=BBSMSTR_000000000461&nttId=4522",
      assetType: "notice",
      isCurrent: true,
      versionLabel: "Current — 0914 revision",
    },
    {
      id: "gks-u-2026-revised",
      track: "gks_u",
      title: "GKS-U 2026 Application Guidelines (Revised)",
      description:
        "Archived NIIED application guidelines for the 2026 Undergraduate cycle, revised after the October 2025 NIRS fire.",
      url: "/official-guidelines/gks-u-2026-revised.pdf",
      versionLabel: "Archive — Revised Oct 2025",
    },
    {
      id: "gks-u-2026-original",
      track: "gks_u",
      title: "GKS-U 2026 Application Guidelines (Original)",
      description:
        "Archived NIIED application guidelines for the 2026 Undergraduate cycle, as originally published.",
      url: "/official-guidelines/gks-u-2026-original.pdf",
      versionLabel: "Archive — Original Sep 2025",
    },
  ],
  gks_g: [
    {
      id: "gks-g-2026",
      track: "gks_g",
      title: "GKS-G 2026 Application Guidelines",
      description: "Official NIIED application guidelines for the 2026 Global Korea Scholarship — Graduate track.",
      url: "https://gksscholarship.com/wp-content/uploads/2026/02/2026-GKS-G-Application-Guidelines-English.pdf",
      downloadFilename: "2026-GKS-G-Application-Guidelines-English.pdf",
    },
  ],
};

export interface GuidelineDifference {
  /** Page number as printed in each PDF's own footer, so it matches what a user sees in their viewer -- a string since some entries span a range (e.g. "9–10"). */
  page: string;
  summary: string;
}

/**
 * Historical note explaining why KMate preserves both 2026 GKS-U editions.
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
    "Both 2026 documents are historical. For an active 2027 GKS-U application, use the 2027 guideline shown above.",
};
