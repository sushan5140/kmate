/**
 * The Deadline Verification Assistant's output contract.
 *
 * Every proposal that reaches the database passes through `parseProposal`
 * first, whatever produced it. That matters most for the case this codebase
 * does not have yet: if a model is ever added behind this interface, its
 * output is untrusted text until it validates. A malformed, truncated or
 * hallucinated field must degrade to needs_review, never to a silent write.
 *
 * The type is intentionally close to the `deadline_proposals` columns so the
 * mapping is obvious, but it is not the row: a row also carries ids, status
 * and decision bookkeeping the assistant has no business setting.
 */

export type Classification = "deadline" | "not_deadline" | "ambiguous";
export type ProposalProgram = "GKS-U" | "GKS-G";
export type ProposalTrack = "embassy" | "university";
export type ProposalDeadlineType =
  | "application_deadline"
  | "document_deadline"
  | "interview"
  | "result"
  | "other";
export type ScopeType = "global" | "country" | "university";

export interface DeadlineProposal {
  classification: Classification;
  /** null = the notice does not say. Never inferred from context. */
  program: ProposalProgram | null;
  /** null = applies across tracks, or the notice does not say. */
  track: ProposalTrack | null;
  cycle: number | null;
  deadline_type: ProposalDeadlineType | null;
  scope_type: ScopeType | null;
  country: string | null;
  university: string | null;
  /** ISO YYYY-MM-DD, exactly as the notice printed it. */
  date: string | null;
  timezone: string | null;
  /** 0..1. How legible the evidence was -- never a claim of correctness. */
  confidence: number;
  /** Verbatim quote from the official notice. */
  evidence: string;
  /** Structured justification. Never a model transcript or chain of thought. */
  reason: string;
}

const CLASSIFICATIONS: Classification[] = ["deadline", "not_deadline", "ambiguous"];
const PROGRAMS: ProposalProgram[] = ["GKS-U", "GKS-G"];
const TRACKS: ProposalTrack[] = ["embassy", "university"];
const DEADLINE_TYPES: ProposalDeadlineType[] = [
  "application_deadline",
  "document_deadline",
  "interview",
  "result",
  "other",
];
const SCOPES: ScopeType[] = ["global", "country", "university"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Rejects impossible calendar dates rather than letting Date roll them over. */
function isRealIsoDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Evidence is rendered in the admin UI. It is quoted from an official page,
 * which means it is third-party text and must not be able to carry markup
 * into the page. React escapes by default, but the value is also stored and
 * may be read by other tools, so angle brackets are stripped at the boundary
 * rather than trusted to every future consumer.
 */
export function sanitizeText(value: string, maxLen = 2000): string {
  return value
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export type ParseResult =
  | { ok: true; value: DeadlineProposal }
  | { ok: false; errors: string[] };

const optEnum = <T extends string>(v: unknown, allowed: T[], field: string, errors: string[]): T | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && (allowed as string[]).includes(v)) return v as T;
  errors.push(`${field}: expected one of ${allowed.join("|")} or null, got ${JSON.stringify(v)}`);
  return null;
};

/**
 * Validates an untrusted object into a DeadlineProposal.
 *
 * Fails closed: any structural problem returns ok:false, and every caller
 * turns that into needs_review. There is deliberately no "best effort"
 * coercion path -- a proposal that had to be repaired is exactly the kind
 * that should be looked at by a person.
 */
export function parseProposal(input: unknown): ParseResult {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["proposal is not an object"] };
  }
  const o = input as Record<string, unknown>;

  const classification = optEnum(o.classification, CLASSIFICATIONS, "classification", errors);
  if (classification === null) errors.push("classification is required");

  const program = optEnum(o.program, PROGRAMS, "program", errors);
  const track = optEnum(o.track, TRACKS, "track", errors);
  const deadline_type = optEnum(o.deadline_type, DEADLINE_TYPES, "deadline_type", errors);
  const scope_type = optEnum(o.scope_type, SCOPES, "scope_type", errors);

  let cycle: number | null = null;
  if (o.cycle !== null && o.cycle !== undefined) {
    if (typeof o.cycle === "number" && Number.isInteger(o.cycle) && o.cycle >= 2000 && o.cycle <= 2100) {
      cycle = o.cycle;
    } else {
      errors.push(`cycle: expected an integer year 2000-2100 or null, got ${JSON.stringify(o.cycle)}`);
    }
  }

  let date: string | null = null;
  if (o.date !== null && o.date !== undefined) {
    if (typeof o.date === "string" && isRealIsoDate(o.date)) date = o.date;
    else errors.push(`date: expected a real YYYY-MM-DD or null, got ${JSON.stringify(o.date)}`);
  }

  let confidence = 0;
  if (typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1 && Number.isFinite(o.confidence)) {
    confidence = o.confidence;
  } else {
    errors.push(`confidence: expected a number 0..1, got ${JSON.stringify(o.confidence)}`);
  }

  const evidence = typeof o.evidence === "string" ? sanitizeText(o.evidence) : "";
  if (!evidence) errors.push("evidence is required and must be non-empty");
  const reason = typeof o.reason === "string" ? sanitizeText(o.reason, 600) : "";
  if (!reason) errors.push("reason is required and must be non-empty");

  const strOrNull = (v: unknown, field: string): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") return sanitizeText(v, 200) || null;
    errors.push(`${field}: expected a string or null`);
    return null;
  };

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      classification: classification as Classification,
      program,
      track,
      cycle,
      deadline_type,
      scope_type,
      country: strOrNull(o.country, "country"),
      university: strOrNull(o.university, "university"),
      date,
      timezone: strOrNull(o.timezone, "timezone"),
      confidence,
      evidence,
      reason,
    },
  };
}
