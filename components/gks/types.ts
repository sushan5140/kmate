/**
 * Client-side view types for the GKS Assistant.
 *
 * These mirror the shapes built in lib/gks/store.ts, which is server-only and
 * so can't be imported here. Kept deliberately narrow: identity is already
 * resolved server-side, and the client is never given the raw `sender_alias`
 * or `author_id` it would need to render an identity of its own.
 */

export type Program = "UG" | "G";

export type AnswerOrigin = "kmate_user" | "community_import";

export interface AnswerView {
  id: string;
  origin: AnswerOrigin;
  authorName: string;
  authorMeta: string | null;
  body: string;
  /** Null for imports -- the corpus has no trustworthy per-message time. */
  createdAt: string | null;
  upvotes: number;
  hasUpvoted: boolean;
}

export interface DiscussionView {
  id: string;
  authorName: string;
  authorMeta: string | null;
  body: string;
  createdAt: string;
  upvotes: number;
  hasUpvoted: boolean;
  replies: DiscussionView[];
}

export interface ThreadState {
  questionId: string;
  askCount: number;
  saved: boolean;
  answers: AnswerView[];
  discussion: DiscussionView[];
}

export interface OfficialEvidence {
  layer: "official";
  score: number;
  program: Program | null;
  category: string | null;
  claim: string | null;
  source_title: string | null;
  source_url: string | null;
  cycle: string | null;
  page: number | null;
  content_type: "table_row" | "prose" | null;
  /** "needs_review" = the PDF table behind this chunk couldn't be reconstructed with confidence. */
  extraction_quality: "clean" | "needs_review" | null;
}

export interface CommunityAnswer {
  text: string;
  tag: string;
  quality_score: number | null;
  /** Why this reply was chosen -- see gks-rag/app/usefulness.py. */
  usefulness: "useful" | "partially_useful" | "unsupported_guess" | "too_vague" | "irrelevant" | null;
  usefulness_reasons?: string[];
  sender_alias?: string | null;
}

export interface CommunityEvidence {
  layer: "community";
  score: number;
  cluster_id: string;
  program: Program | "mixed" | "unknown" | null;
  category: string | null;
  question: string | null;
  variant_count: number;
  source_group_count: number;
  answer_confidence: "low" | "medium" | "high";
  possible_conflict: boolean;
  answers: CommunityAnswer[];
}

export interface ConflictInfo {
  /** Community replies disagree with each other. */
  community_internal: boolean;
  /** Community replies contradict the retrieved official text. */
  against_official: boolean;
}

export interface AskResult {
  question: string;
  program: Program;
  answer: string;
  mode: "retrieval_only" | "rag_generated" | "needs_clarification";
  needs_clarification?: boolean;
  clarification?: string;
  official_sources_found: number;
  community_cases_found: number;
  conflict?: ConflictInfo;
  coverage: {
    question_concepts: string[];
    covered: string[];
    unsupported: string[];
    unsupported_labels: string[];
  };
  evidence: {
    official: OfficialEvidence[];
    community: CommunityEvidence[];
  };
  /** Null when persistence failed -- the answer still renders, just without voting. */
  thread: ThreadState | null;
}
