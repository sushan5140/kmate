/**
 * Shape of the official-notice review queue.
 *
 * This layer exists to keep one guarantee: discovery can put things in front
 * of a human, and nothing else. No field here is ever promoted into
 * data/deadlines-notices-data.json by code -- that dataset is source-
 * controlled and only changes through a reviewed commit.
 *
 * Every field that the official notice does not state comes back as
 * "unknown"/null. Nothing is guessed to make a record look complete.
 */

/** The dataset uses "GKS-U" | "GKS-G"; the queue adds "unknown" for notices that name neither. */
export type QueueProgram = "GKS-U" | "GKS-G" | "unknown";

/** null means the notice does not state a track -- NOT "applies to both". */
export type QueueTrack = "embassy" | "university" | null;

/** Mirrors NoticeRecord["type"] in lib/deadlines/schema.ts so an approved item maps 1:1. */
export type QueueNoticeType = "guideline" | "result" | "schedule_change" | "deadline" | "other";

export type QueueStatus = "pending_review" | "approved" | "rejected";

/**
 * A date found in the notice body. Explicitly a CANDIDATE: it records that a
 * date appears near certain words, not that KMate accepts it as a deadline.
 * Promotion is a human editorial act performed in the repository.
 */
export interface CandidateDate {
  /** ISO YYYY-MM-DD as printed in the notice. Never shifted, never inferred. */
  date: string;
  /** What kind of date the surrounding words suggest. "unclassified" when they suggest nothing. */
  kind:
    | "application_deadline"
    | "document_submission"
    | "result_announcement"
    | "interview"
    | "final_university_choice"
    | "invitation_letter"
    | "unclassified";
  /** Verbatim surrounding text, so a reviewer can judge the date in its own words. */
  context: string;
  /** The exact substring that was parsed into `date`. */
  rawMatch: string;
  /** Official page the date was read from. */
  sourceUrl: string;
  /**
   * How strongly the surrounding words identify the date's meaning.
   * high   -- an explicit labelling phrase sits next to the date
   * medium -- a weaker/ambiguous cue
   * low    -- a date with no meaningful cue at all
   * Never an assertion of correctness, only of how legible the cue was.
   */
  confidence: "high" | "medium" | "low";
}

export interface PendingNotice {
  id: string;
  source_url: string;
  /** The board's own notice identifier (nttId), when the URL carries one. */
  source_notice_id: string | null;
  title: string;
  /** NULL when the notice states no date. Never back-filled. */
  published_at: string | null;
  program: QueueProgram;
  track: QueueTrack;
  notice_type: QueueNoticeType;
  extracted_dates: CandidateDate[];
  source_publisher: string;
  discovered_at: string;
  status: QueueStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export const QUEUE_STATUSES: QueueStatus[] = ["pending_review", "approved", "rejected"];

export const NOTICE_TYPE_LABELS: Record<QueueNoticeType, string> = {
  guideline: "Guideline",
  result: "Result",
  schedule_change: "Schedule change",
  deadline: "Deadline",
  other: "Other",
};

export const PROGRAM_LABELS: Record<QueueProgram, string> = {
  "GKS-U": "GKS-U",
  "GKS-G": "GKS-G",
  unknown: "Unknown program",
};

export const CANDIDATE_KIND_LABELS: Record<CandidateDate["kind"], string> = {
  application_deadline: "Application deadline",
  document_submission: "Document submission",
  result_announcement: "Result announcement",
  interview: "Interview",
  final_university_choice: "Final university choice",
  invitation_letter: "Invitation letter",
  unclassified: "Unclassified date",
};
