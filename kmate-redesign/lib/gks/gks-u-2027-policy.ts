import { GKS_U_2027_SOURCE } from "@/lib/gks/guidelines-2027";

export const GKS_U_2027_POLICY = {
  cycle: "2027",
  source: GKS_U_2027_SOURCE,
  lastReviewed: "2026-09-14",
  embassyApplication: {
    opensAtUtc: "2026-09-15T02:00:00Z",
    closesAtUtc: "2026-09-30T09:00:00Z",
    display: "Sep 15, 11:00 → Sep 30, 18:00 KST",
    method: "Study in Korea online system",
  },
  universityTrackWindow: {
    display: "September–November 2026",
    note: "Exact dates and submission method are set by each university.",
  },
  choiceRules: {
    general: {
      maxUniversities: 3,
      requireTypeB: true,
      display: "Up to 3 universities; at least 1 must be Type B",
    },
    r_gks: {
      maxUniversities: 2,
      requireAllTypeB: true,
      display: "Up to 2 universities; all choices must be Type B",
    },
    university: {
      maxUniversities: 1,
      maxDepartments: 1,
      display: "1 university + 1 department",
    },
  },
  timeline: {
    embassyRound1ResultBy: "2026-10-16",
    niiedRound2: "Late November 2026",
    universityRound3By: "2026-12-23",
    finalUniversityChoiceBy: "2026-12-29",
    finalResultExpected: "2027-01-07",
  },
  fallback: {
    afterEmbassyRound1Fail:
      "May apply through University Track if that university's deadline is still open.",
    afterEmbassyRound1Pass:
      "Cannot apply through University Track after passing Embassy Round 1, including as a backup candidate.",
  },
  evaluation: {
    topikBand: (level: number) =>
      level >= 5 ? 100 : level === 4 ? 90 : level === 3 ? 80 : level === 2 ? 70 : level === 1 ? 60 : 50,
    ieltsBand: (score: number | null) =>
      score === null || !Number.isFinite(score)
        ? 50
        : score >= 8
          ? 90
          : score >= 7
            ? 80
            : score >= 6
              ? 70
              : score >= 5
                ? 60
                : 50,
    topikBonus: (level: number) => (level >= 5 ? 5 : level === 4 ? 4 : level === 3 ? 3 : 0),
    scienceEngineeringBonusPct: 5,
  },
  documents: {
    embassyFirstRound:
      "Complete forms online; upload scanned required certificates and a scanned recommendation letter.",
    universityFirstRound:
      "Follow the university's own submission method and any additional university-specific document instructions.",
    secondRound:
      "First-round successful applicants submit the required original/certified documents for NIIED's second round by the institution's deadline.",
  },
} as const;

export type GksU2027EmbassyPath = "general" | "r_gks";
