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

/** Verb-first phrasing for an already-unlocked contact method, e.g. on a Connected card. */
export const CONTACT_TYPE_ACTION_LABELS: Record<ContactType, string> = {
  instagram: "View Instagram",
  tiktok: "View TikTok",
  whatsapp: "Message on WhatsApp",
  telegram: "Message on Telegram",
  discord: "Add on Discord",
  other: "Contact",
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

export const ECA_TRACKS = ["gks_u", "gks_g", "both"] as const;
export type EcaTrack = (typeof ECA_TRACKS)[number];

export const ECA_TRACK_LABELS: Record<EcaTrack, string> = {
  gks_u: "GKS-U",
  gks_g: "GKS-G",
  both: "Both tracks",
};

export const ECA_ACTIVITY_TYPES = [
  "academic_competition",
  "cultural_engagement_korea",
  "internship_work_experience",
  "language_study_topik",
  "leadership_role",
  "online_course_certification",
  "other",
  "research_publication",
  "volunteering_community_service",
] as const;
export type EcaActivityType = (typeof ECA_ACTIVITY_TYPES)[number];

export const ECA_ACTIVITY_TYPE_LABELS: Record<EcaActivityType, string> = {
  academic_competition: "Academic competition",
  cultural_engagement_korea: "Korea cultural engagement",
  internship_work_experience: "Internship / work experience",
  language_study_topik: "Language study / TOPIK",
  leadership_role: "Leadership role",
  online_course_certification: "Online course / certification",
  other: "Other",
  research_publication: "Research / publication",
  volunteering_community_service: "Volunteering / community service",
};

export const ECA_IMPACT_AREAS = [
  "general_competitiveness",
  "interview_talking_point",
  "scoring_points_niied",
  "strengthens_recommendation",
  "strengthens_sop",
  "strengthens_study_plan",
] as const;
export type EcaImpactArea = (typeof ECA_IMPACT_AREAS)[number];

export const ECA_IMPACT_AREA_LABELS: Record<EcaImpactArea, string> = {
  general_competitiveness: "General competitiveness",
  interview_talking_point: "Interview talking point",
  scoring_points_niied: "NIIED scoring points",
  strengthens_recommendation: "Strengthens recommendation",
  strengthens_sop: "Strengthens personal statement",
  strengthens_study_plan: "Strengthens study plan",
};

export const MISTAKE_DOCUMENT_TYPES = [
  "passport",
  "apostille",
  "recommendation",
  "medical",
  "transcript",
  "study_plan",
  "sop",
  "interview",
  "university_choice",
  "other",
] as const;
export type MistakeDocumentType = (typeof MISTAKE_DOCUMENT_TYPES)[number];

export const MISTAKE_DOCUMENT_TYPE_LABELS: Record<MistakeDocumentType, string> = {
  passport: "Passport",
  apostille: "Apostille",
  recommendation: "Recommendation letter",
  medical: "Medical check",
  transcript: "Transcript",
  study_plan: "Study plan",
  sop: "Personal statement",
  interview: "Interview",
  university_choice: "University choice",
  other: "Other",
};

export const MISTAKE_REASON_CATEGORIES = [
  "weak_study_plan",
  "generic_sop",
  "missing_document",
  "poor_interview",
  "wrong_university_choice",
  "other",
] as const;
export type MistakeReasonCategory = (typeof MISTAKE_REASON_CATEGORIES)[number];

export const MISTAKE_REASON_CATEGORY_LABELS: Record<MistakeReasonCategory, string> = {
  weak_study_plan: "Weak study plan",
  generic_sop: "Generic personal statement",
  missing_document: "Missing document",
  poor_interview: "Poor interview",
  wrong_university_choice: "Wrong university choice",
  other: "Other",
};

// Shared between mistake_entries and eca_entries -- both feature the same
// "where did this come from, how solid is it" research-provenance shape.
export const SOURCE_PLATFORMS = ["facebook", "reddit", "blog", "forum", "other"] as const;
export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];

export const SOURCE_PLATFORM_LABELS: Record<SourcePlatform, string> = {
  facebook: "Facebook",
  reddit: "Reddit",
  blog: "Blog",
  forum: "Forum",
  other: "Other",
};

export const CONFIDENCE_LEVELS = ["recurring_theme", "single_anecdote"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  recurring_theme: "Recurring theme",
  single_anecdote: "Single anecdote",
};

export const CONNECTION_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "revoked",
] as const;
export type ConnectionRequestStatus = (typeof CONNECTION_REQUEST_STATUSES)[number];

export function applicationYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear + 1, currentYear + 2];
}
