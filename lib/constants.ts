export const TRACKS = ["gks_u", "gks_g"] as const;
export type Track = (typeof TRACKS)[number];

export const TRACK_LABELS: Record<Track, string> = {
  gks_u: "GKS-U",
  gks_g: "GKS-G",
};

export const TRACK_BADGE_CLASS: Record<Track, string> = {
  gks_u: "bg-gks-u/10 text-gks-u",
  gks_g: "bg-gks-g/10 text-gks-g",
};

export const GKS_U_EMBASSY_PATHS = ["general_overseas", "r_gks"] as const;
export type GksUEmbassyPath = (typeof GKS_U_EMBASSY_PATHS)[number];

export const CONTACT_TYPES = [
  "instagram",
  "tiktok",
  "whatsapp",
  "telegram",
  "discord",
  "other",
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  discord: "Discord",
  other: "Other",
};

export const QUESTION_CATEGORIES = [
  "motivation",
  "academic_background",
  "korea_specific",
  "major_specific",
  "behavioral",
  "curveball",
] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

export const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
  motivation: "Motivation",
  academic_background: "Academic Background",
  korea_specific: "Korea-specific",
  major_specific: "Major-specific",
  behavioral: "Behavioral",
  curveball: "Curveball",
};

// Reuses the app's existing accent tokens (same bg-{color}/10 text-{color}
// pattern as TRACK_BADGE_CLASS) rather than introducing new colors -- one
// category (academic_background) falls back to a neutral ink tint since
// there are 6 categories but only 5 distinct accent hues in the palette.
export const QUESTION_CATEGORY_BADGE_CLASS: Record<QuestionCategory, string> = {
  motivation: "bg-primary/10 text-primary",
  academic_background: "bg-ink/[0.06] text-muted",
  korea_specific: "bg-gks-u/10 text-gks-u",
  major_specific: "bg-success/10 text-success",
  behavioral: "bg-gold/10 text-gold",
  curveball: "bg-danger/10 text-danger",
};

export const CONNECTION_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "revoked",
] as const;
export type ConnectionRequestStatus = (typeof CONNECTION_REQUEST_STATUSES)[number];

/**
 * GKS notices for the current calendar year are typically already closed by
 * the time an applicant is onboarding (GKS-G ~Feb-Mar, GKS-U ~Sept-Oct) --
 * only the next two intakes are actually open to apply for.
 */
export function applicationYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  return [currentYear + 1, currentYear + 2];
}
