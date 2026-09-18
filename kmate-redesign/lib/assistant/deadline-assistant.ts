import { classifyNotice } from "@/lib/notices/classify";
import type { CandidateDate } from "@/lib/notices/review-schema";
import { parseProposal, sanitizeText, type DeadlineProposal, type ParseResult } from "./schema";

/**
 * The Deadline Verification Assistant -- deterministic rules, not a model.
 *
 * The audit called for a structured classifier over a free-form agent, and
 * nothing here needs generative text: every field the proposal carries is
 * either quoted from the notice or derived by a rule that can be read and
 * argued with. That also means the assistant is exactly reproducible, which
 * is what makes auto-verification defensible at all -- the same notice always
 * yields the same proposal, and a reviewer can see why.
 *
 * `proposeFromCandidate` returns the same validated shape a model-backed
 * implementation would have to satisfy, so one can be slotted in behind
 * `parseProposal` later without changing a single caller.
 */

export interface NoticeContext {
  title: string;
  body: string;
  sourceUrl: string;
  publishedAt: string | null;
  /** The human-approved classification from the review queue. */
  approvedProgram: "GKS-U" | "GKS-G" | "unknown";
  approvedTrack: "embassy" | "university" | null;
}

/**
 * Candidate kinds map onto proposal deadline types. `unclassified` has no
 * mapping on purpose: a date whose meaning the extractor could not read is
 * not something the assistant should name either.
 */
const KIND_TO_TYPE: Record<string, DeadlineProposal["deadline_type"]> = {
  application_deadline: "application_deadline",
  document_submission: "document_deadline",
  result_announcement: "result",
  interview: "interview",
  final_university_choice: "other",
  invitation_letter: "other",
};

/** Types that are dates in a notice but are NOT an application deadline. */
const NOT_A_DEADLINE: DeadlineProposal["deadline_type"][] = ["result", "interview"];

/**
 * The cycle the notice is about.
 *
 * Read from an explicit four-digit year in the TITLE only. A GKS notice names
 * its cycle in its own headline ("2026 Global Korea Scholarship ..."); a year
 * appearing only in the body is as likely to belong to a cited past round.
 * Two different years in the title means the notice spans or compares cycles
 * and the assistant does not choose.
 */
export function extractCycle(title: string): number | null {
  const years = [...title.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  const unique = [...new Set(years)];
  return unique.length === 1 ? unique[0] : null;
}

/**
 * Scope. NIIED notices are program-wide unless they name a narrower audience.
 *
 * Country and university scope are only ever asserted from explicit wording,
 * and this module never derives a country from a university name -- there is
 * no trusted mapping in the codebase to do it with, and guessing would put a
 * wrong country on a deadline that applicants filter by.
 */
export function extractScope(text: string): {
  scope_type: DeadlineProposal["scope_type"];
  country: string | null;
  university: string | null;
} {
  const embassyCountry = text.match(/\bembassy of the republic of korea in ([A-Z][A-Za-z .'-]{2,40})/i);
  if (embassyCountry) {
    return { scope_type: "country", country: sanitizeText(embassyCountry[1], 60), university: null };
  }
  const applicantsIn = text.match(/\bapplicants? (?:in|from) ([A-Z][A-Za-z .'-]{2,40})\b/);
  if (applicantsIn) {
    return { scope_type: "country", country: sanitizeText(applicantsIn[1], 60), university: null };
  }
  const uni = text.match(/\b([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+){0,3} University)\b/);
  if (uni) {
    return { scope_type: "university", country: null, university: sanitizeText(uni[1], 80) };
  }
  return { scope_type: "global", country: null, university: null };
}

/** Wording that makes a date an actual closing moment rather than a mention. */
const EXPLICIT_DEADLINE_WORDING = [
  /\bdeadline\b/i,
  /\bmust be (?:submitted|received)\b/i,
  /\bno later than\b/i,
  /\bapplications? (?:close|closes|closing)\b/i,
  /\bclosing date\b/i,
  /\bsubmit(?:ted)? by\b/i,
  /\bdue (?:date|by)\b/i,
];

export interface ProposalInput {
  notice: NoticeContext;
  candidate: CandidateDate;
  /** Every candidate on the same notice, for conflict awareness. */
  siblings: CandidateDate[];
}

/**
 * Builds and validates one proposal for one candidate date.
 *
 * Returns the ParseResult rather than the proposal so a caller cannot forget
 * to check it: a schema failure is a needs_review outcome, never a write.
 */
export function proposeFromCandidate({ notice, candidate, siblings }: ProposalInput): ParseResult {
  const combined = `${notice.title}\n${notice.body}`;
  const derived = classifyNotice(notice.title, notice.body);

  // The human-approved classification wins over the assistant's own reading.
  // A reviewer has already looked at this notice; re-deriving and disagreeing
  // with them would be the assistant overruling a person.
  const program =
    notice.approvedProgram !== "unknown"
      ? notice.approvedProgram
      : derived.program !== "unknown"
        ? derived.program
        : null;
  const track = notice.approvedTrack ?? derived.track;

  const cycle = extractCycle(notice.title);
  const scope = extractScope(combined);
  const deadlineType = KIND_TO_TYPE[candidate.kind] ?? null;

  const context = candidate.context ?? "";
  const hasExplicitWording = EXPLICIT_DEADLINE_WORDING.some((r) => r.test(context));

  // Another candidate carrying a DIFFERENT date but the same meaning is a
  // genuine contradiction inside one notice.
  const conflicting = siblings.filter(
    (s) => s.kind === candidate.kind && s.date !== candidate.date
  );

  const reasons: string[] = [];
  let classification: DeadlineProposal["classification"];
  let confidence: number;

  if (deadlineType && NOT_A_DEADLINE.includes(deadlineType)) {
    classification = "not_deadline";
    confidence = 0.95;
    reasons.push(`the surrounding text describes a ${deadlineType.replace("_", " ")}, not an application deadline`);
  } else if (candidate.kind === "unclassified" || !deadlineType) {
    classification = "ambiguous";
    confidence = 0.2;
    reasons.push("the notice states a date but no wording identifying what it is");
  } else if (conflicting.length > 0) {
    classification = "ambiguous";
    confidence = 0.3;
    reasons.push(
      `the notice states ${conflicting.length + 1} different dates of this kind (${[candidate.date, ...conflicting.map((c) => c.date)].join(", ")})`
    );
  } else if (!hasExplicitWording) {
    classification = "ambiguous";
    confidence = 0.5;
    reasons.push("no explicit closing wording sits beside the date");
  } else {
    classification = "deadline";
    // Confidence is earned field by field, so a proposal missing the cycle or
    // the programme cannot reach the auto-verify threshold by accident.
    confidence = 0.9;
    if (candidate.confidence === "high") confidence += 0.05;
    if (cycle !== null) confidence += 0.02;
    if (program !== null) confidence += 0.02;
    confidence = Math.min(0.99, Number(confidence.toFixed(3)));
    reasons.push("an explicit closing phrase labels this date in the official text");
    if (cycle === null) reasons.push("the cycle is not stated in the title");
    if (program === null) reasons.push("the programme is not stated");
  }

  return parseProposal({
    classification,
    program,
    track,
    cycle,
    deadline_type: deadlineType,
    scope_type: scope.scope_type,
    country: scope.country,
    university: scope.university,
    date: classification === "deadline" ? candidate.date : null,
    // NIIED publishes Korean time; asserted only when the notice says so.
    timezone: /\bKST\b|Korea Standard Time|한국\s*시간/i.test(combined) ? "Asia/Seoul" : null,
    confidence,
    evidence: candidate.context || notice.title,
    reason: reasons.join("; "),
  });
}
