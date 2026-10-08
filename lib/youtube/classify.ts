/**
 * Descriptive classification of a queued reply.
 *
 * Everything here answers "what IS this row", never "what should happen to
 * it". None of these values can make a row postable: the safety predicates in
 * queue-schema.ts do not read a single field defined in this file, so a
 * misclassification changes what an admin sees and how a count is grouped,
 * and nothing else.
 *
 * That separation is deliberate. Priority orders the work queue; it does not
 * override HOLD, SKIP, or any status rule. A KMate feature matching a
 * question is shown as context; it does not promote KMate into the reply.
 * The promotion category is read off the draft that already exists; nothing
 * here rewrites a draft, and nothing here exists to make a reply less
 * detectable.
 *
 * Pure module: no `server-only`, no database, no network.
 */

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];

export function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}

/** Ordering weight -- High first, then Medium, then Low. */
export const PRIORITY_RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * Initial priority from the scout's own judgement.
 *
 * The sheet grades confidence as a word ("High"), not a probability, and
 * carries a numeric score beside it. The word wins when present because it is
 * the scout's explicit verdict; the score is only a fallback. An unreadable
 * value becomes MEDIUM -- neither promoted nor buried on a guess.
 */
export function priorityFromImport(confidence: string | null, score: number | null): Priority {
  const word = confidence?.trim().toLowerCase();
  if (word === "high") return "HIGH";
  if (word === "medium" || word === "med") return "MEDIUM";
  if (word === "low") return "LOW";

  if (typeof score === "number" && Number.isFinite(score)) {
    if (score >= 5) return "HIGH";
    if (score >= 3) return "MEDIUM";
    return "LOW";
  }
  return "MEDIUM";
}

// ---------------------------------------------------------------------------
// Opportunity type -- what the ORIGINAL question is about
// ---------------------------------------------------------------------------

export const OPPORTUNITY_TYPES = ["GKS", "GENERAL"] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export function isOpportunityType(value: unknown): value is OpportunityType {
  return typeof value === "string" && (OPPORTUNITY_TYPES as readonly string[]).includes(value);
}

const GKS_PATTERNS = [
  /\bgks\b/i,
  /global\s+korea\s+scholarship/i,
  /korean?\s+government\s+scholarship/i,
  /\bkgsp\b/i,
  /niied/i,
];

/**
 * Whether the question itself is about GKS, or about studying in Korea more
 * generally.
 *
 * Entirely separate from whether the REPLY mentions KMate -- a GKS question
 * may get a plain answer, and a general question may warrant a KMate link.
 * Conflating the two would make both counts meaningless.
 */
export function opportunityTypeFrom(
  originalText: string | null,
  topic: string | null
): OpportunityType {
  const haystack = `${originalText ?? ""} ${topic ?? ""}`;
  return GKS_PATTERNS.some((p) => p.test(haystack)) ? "GKS" : "GENERAL";
}

// ---------------------------------------------------------------------------
// Promotion category -- what the REPLY does
// ---------------------------------------------------------------------------

export const PROMOTION_CATEGORIES = ["ANSWER_ONLY", "KMATE_MENTION", "KMATE_LINK"] as const;
export type PromotionCategory = (typeof PROMOTION_CATEGORIES)[number];

export const PROMOTION_LABELS: Record<PromotionCategory, string> = {
  ANSWER_ONLY: "Answer only",
  KMATE_MENTION: "KMate mention",
  KMATE_LINK: "KMate link",
};

const URL_PATTERN = /(https?:\/\/|www\.)[^\s]+|\b[a-z0-9-]+\.(com|org|net|io|app|co|kr|in)\b/i;
const KMATE_PATTERN = /\bk\s*-?\s*mate\b/i;

/**
 * Reads what a draft actually does, from the draft itself.
 *
 * Derived rather than hand-set so the label cannot drift away from the text
 * an admin edited. Recomputed on every edit for the same reason.
 *
 * Ordering matters: a reply carrying a link is KMATE_LINK even if it also
 * says "KMate", because the link is the more consequential fact. This is
 * reporting only -- it exists so the admin can see at a glance how
 * promotional the day's output has been, and it never alters or suggests
 * altering the text.
 */
export function promotionCategoryOf(draft: string | null): PromotionCategory {
  const text = draft?.trim();
  if (!text) return "ANSWER_ONLY";
  if (URL_PATTERN.test(text)) return "KMATE_LINK";
  if (KMATE_PATTERN.test(text)) return "KMATE_MENTION";
  return "ANSWER_ONLY";
}

// ---------------------------------------------------------------------------
// KMate feature match -- why KMate is relevant to this question
// ---------------------------------------------------------------------------

export const KMATE_FEATURES = [
  "University Comparison",
  "GKS Assistant",
  "Interview Questions",
  "AI Mock Interview",
  "Official Notices",
  "Scholarships",
  "Applicant Community",
  "Requirements",
] as const;

export type KmateFeature = (typeof KMATE_FEATURES)[number];

const FEATURE_PATTERNS: ReadonlyArray<readonly [KmateFeature, RegExp]> = [
  ["University Comparison", /\b(compare|comparison|which\s+uni|best\s+uni|shortlist|rank)/i],
  ["GKS Assistant", /\b(gks|kgsp|global\s+korea\s+scholarship)\b/i],
  ["Interview Questions", /\binterview\s+(question|prep|round)/i],
  ["AI Mock Interview", /\bmock\s+interview|practice\s+interview/i],
  ["Official Notices", /\b(notice|announcement|official\s+(pdf|guideline)|circular)/i],
  ["Scholarships", /\bscholarship|funding|stipend|tuition\s+waiver/i],
  ["Applicant Community", /\b(community|other\s+applicants|group|discord|seniors?)\b/i],
  ["Requirements", /\b(requirement|eligib|gpa|topik|document|apostille|transcript)/i],
];

/**
 * Which KMate features are relevant to this question.
 *
 * Informational only, and explicitly NOT a trigger: a match here never sets
 * the promotion category, never edits a draft, and never makes a KMate
 * mention more likely. The admin decides whether KMate belongs in the reply;
 * this only saves them re-reading the question to work out why it might.
 */
export function featureTagsFor(originalText: string | null, topic: string | null): KmateFeature[] {
  const haystack = `${originalText ?? ""} ${topic ?? ""}`;
  if (!haystack.trim()) return [];
  return FEATURE_PATTERNS.filter(([, pattern]) => pattern.test(haystack)).map(([feature]) => feature);
}

// ---------------------------------------------------------------------------
// Reply voice -- General vs KMate, as the sheet chose it
// ---------------------------------------------------------------------------

export type ReplyVoice = "KMate" | "General";

/**
 * Which of the two drafted replies was chosen. Reads the sheet's explicit
 * choice, falling back to the use_kmate flag.
 */
export function replyVoiceOf(bestChoice: string | null, useKmate: boolean | null): ReplyVoice {
  const choice = bestChoice?.trim().toLowerCase();
  if (choice === "kmate") return "KMate";
  if (choice === "general") return "General";
  return useKmate ? "KMate" : "General";
}
