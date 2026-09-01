export const RECOVERY_STATUSES = [
  "DRAFTED",
  "APPROVED",
  "POSTING",
  "API_ACCEPTED",
  "VERIFIED_LIVE",
  "HOLD",
  "SKIP",
  "REMOVED",
  "FAILED",
] as const;

export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];
export type RecoveryCategory = "ANSWER_ONLY" | "KMATE_LINK";
export type RecoveryLegacyOutcome = "POSTED_RECORDED" | "CONFIRMED_REMOVED";
export type RecoverySheetMatrix = readonly (readonly unknown[])[];

export interface FreshRecoveryRow {
  recovery_batch: number;
  recovery_order: number;
  author_name: string;
  topic: string;
  category: RecoveryCategory;
  draft_text: string;
}

export interface LegacyPostedRecord {
  youtube_comment_id: string;
  legacy_reply_id: string;
  author_name: string;
  legacy_draft_text: string | null;
  video_id: string | null;
  spreadsheet_row: number | null;
}

export interface LegacyRecoveryEvidence {
  youtube_comment_id: string;
  legacy_reply_id: string | null;
  recovery_status: string | null;
  notes: string | null;
}

export interface MatchedRecoveryRow extends FreshRecoveryRow {
  youtube_comment_id: string;
  legacy_reply_id: string;
  legacy_draft_text: string | null;
  legacy_outcome: RecoveryLegacyOutcome;
  legacy_recovery_evidence: LegacyRecoveryEvidence | null;
  batch02_comment_found: boolean;
  reviewed_parent_override_used: boolean;
}

export interface RecoveryAttemptInsert {
  queue_id: string | null;
  youtube_comment_id: string;
  legacy_reply_id: string;
  legacy_draft_text: string | null;
  legacy_outcome: RecoveryLegacyOutcome;
  legacy_evidence: Record<string, unknown>;
  recovery_set: string;
  author_name: string;
  recovery_batch: number;
  recovery_order: number;
  category: RecoveryCategory;
  draft_text: string;
  status: "DRAFTED";
}

export class RecoveryImportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RecoveryImportError";
    this.code = code;
  }
}

const REQUIRED_FRESH_HEADERS = [
  "batch",
  "order",
  "author",
  "topic",
  "category",
  "fresh_reply",
  "review_status",
] as const;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function integer(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function authorKey(author: string): string {
  return author.trim().toLocaleLowerCase("en-US");
}

function headerMap(row: readonly unknown[]): Map<string, number> {
  const columns = new Map<string, number>();
  row.forEach((value, index) => {
    const name = text(value)?.toLocaleLowerCase("en-US");
    if (name && !columns.has(name)) columns.set(name, index);
  });
  return columns;
}

function findHeaderRow(matrix: RecoverySheetMatrix, marker: string): number {
  const limit = Math.min(matrix.length, 12);
  for (let index = 0; index < limit; index++) {
    if (headerMap(matrix[index] ?? []).has(marker)) return index;
  }
  return -1;
}

function cell(row: readonly unknown[], columns: Map<string, number>, name: string): unknown {
  const index = columns.get(name);
  return index === undefined ? null : row[index];
}

export function parseFreshRecoverySheet(matrix: RecoverySheetMatrix): FreshRecoveryRow[] {
  const headerRow = findHeaderRow(matrix, "fresh_reply");
  if (headerRow < 0) {
    throw new RecoveryImportError("fresh_header_not_found", "Fresh-reply header row was not found.");
  }

  const columns = headerMap(matrix[headerRow] ?? []);
  for (const required of REQUIRED_FRESH_HEADERS) {
    if (!columns.has(required)) {
      throw new RecoveryImportError("fresh_column_missing", `Required column "${required}" is missing.`);
    }
  }

  const rows: FreshRecoveryRow[] = [];
  for (let index = headerRow + 1; index < matrix.length; index++) {
    const source = matrix[index] ?? [];
    if (source.every((value) => value === null || value === undefined || value === "")) continue;

    const batch = integer(cell(source, columns, "batch"));
    const order = integer(cell(source, columns, "order"));
    const author = text(cell(source, columns, "author"));
    const topic = text(cell(source, columns, "topic"));
    const category = text(cell(source, columns, "category"));
    const draft = text(cell(source, columns, "fresh_reply"));
    const reviewStatus = text(cell(source, columns, "review_status"));

    if (!batch || !order || !author || !topic || !draft) {
      throw new RecoveryImportError("fresh_row_invalid", `Fresh workbook row ${index + 1} is incomplete.`);
    }
    if (category !== "ANSWER_ONLY" && category !== "KMATE_LINK") {
      throw new RecoveryImportError("fresh_category_invalid", `Order ${order} has invalid category.`);
    }
    if (reviewStatus !== "READY_FOR_MANUAL_REVIEW") {
      throw new RecoveryImportError("fresh_review_status_invalid", `Order ${order} is not ready for manual review.`);
    }
    if (draft.length > 9500) {
      throw new RecoveryImportError("fresh_draft_too_long", `Order ${order} exceeds the draft limit.`);
    }

    const hasKmateLink = draft.includes("https://kmate.vercel.app");
    if ((category === "KMATE_LINK") !== hasKmateLink) {
      throw new RecoveryImportError("fresh_category_mismatch", `Order ${order} category does not match its draft.`);
    }

    rows.push({
      recovery_batch: batch,
      recovery_order: order,
      author_name: author,
      topic,
      category,
      draft_text: draft,
    });
  }

  if (rows.length !== 20) {
    throw new RecoveryImportError("fresh_count_invalid", `Expected 20 fresh rows; found ${rows.length}.`);
  }

  const orders = new Set(rows.map((row) => row.recovery_order));
  if (orders.size !== 20 || !Array.from({ length: 20 }, (_, index) => index + 1).every((order) => orders.has(order))) {
    throw new RecoveryImportError("fresh_orders_invalid", "Recovery orders must be unique and exactly 1 through 20.");
  }

  const batchCounts = new Map<number, number>();
  for (const row of rows) {
    const expectedBatch = Math.floor((row.recovery_order - 1) / 5) + 1;
    if (row.recovery_batch !== expectedBatch) {
      throw new RecoveryImportError("fresh_batch_invalid", `Order ${row.recovery_order} belongs in batch ${expectedBatch}.`);
    }
    batchCounts.set(row.recovery_batch, (batchCounts.get(row.recovery_batch) ?? 0) + 1);
  }
  if (![1, 2, 3, 4].every((batch) => batchCounts.get(batch) === 5)) {
    throw new RecoveryImportError("fresh_batch_counts_invalid", "Expected four recovery batches of five rows each.");
  }

  return rows.sort((left, right) => left.recovery_order - right.recovery_order);
}

export function parseLegacyPostedReplies(raw: unknown): LegacyPostedRecord[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RecoveryImportError("legacy_json_invalid", "posted_replies.json must be an object keyed by parent comment id.");
  }

  const rows: LegacyPostedRecord[] = [];
  for (const [commentIdRaw, value] of Object.entries(raw as Record<string, unknown>)) {
    const commentId = commentIdRaw.trim();
    if (!commentId || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const replyId = text(record.reply_id);
    const author = text(record.author);
    if (!replyId || !author) continue;
    rows.push({
      youtube_comment_id: commentId,
      legacy_reply_id: replyId,
      author_name: author,
      legacy_draft_text: text(record.reply),
      video_id: text(record.video_id),
      spreadsheet_row: integer(record.spreadsheet_row),
    });
  }
  return rows;
}

export function parseLegacyRecoveryEvidence(matrix: RecoverySheetMatrix): LegacyRecoveryEvidence[] {
  const headerRow = findHeaderRow(matrix, "comment_id");
  if (headerRow < 0) {
    throw new RecoveryImportError("recovery_header_not_found", "Recovery evidence header row was not found.");
  }
  const columns = headerMap(matrix[headerRow] ?? []);
  for (const required of ["comment_id", "old_reply_id", "recovery_status"]) {
    if (!columns.has(required)) {
      throw new RecoveryImportError("recovery_column_missing", `Recovery evidence column "${required}" is missing.`);
    }
  }

  const rows: LegacyRecoveryEvidence[] = [];
  for (let index = headerRow + 1; index < matrix.length; index++) {
    const source = matrix[index] ?? [];
    const commentId = text(cell(source, columns, "comment_id"));
    if (!commentId) continue;
    rows.push({
      youtube_comment_id: commentId,
      legacy_reply_id: text(cell(source, columns, "old_reply_id")),
      recovery_status: text(cell(source, columns, "recovery_status")),
      notes: text(cell(source, columns, "notes")),
    });
  }
  return rows;
}

export function parseBatchCommentIds(matrix: RecoverySheetMatrix): Set<string> {
  const headerRow = findHeaderRow(matrix, "comment_id");
  if (headerRow < 0) {
    throw new RecoveryImportError("batch_header_not_found", "Batch comment header row was not found.");
  }
  const columns = headerMap(matrix[headerRow] ?? []);
  const ids = new Set<string>();
  for (let index = headerRow + 1; index < matrix.length; index++) {
    const id = text(cell(matrix[index] ?? [], columns, "comment_id"));
    if (id) ids.add(id);
  }
  return ids;
}

export function matchRecoveryRows(input: {
  freshRows: FreshRecoveryRow[];
  postedRows: LegacyPostedRecord[];
  recoveryEvidence: LegacyRecoveryEvidence[];
  batchCommentIds: Set<string>;
  reviewedParentOverrides?: Readonly<Record<number, string>>;
}): MatchedRecoveryRow[] {
  const postedByAuthor = new Map<string, LegacyPostedRecord[]>();
  for (const row of input.postedRows) {
    const key = authorKey(row.author_name);
    postedByAuthor.set(key, [...(postedByAuthor.get(key) ?? []), row]);
  }
  const evidenceByComment = new Map(
    input.recoveryEvidence.map((row) => [row.youtube_comment_id, row] as const)
  );
  const usedParents = new Set<string>();

  return input.freshRows.map((fresh) => {
    const candidates = postedByAuthor.get(authorKey(fresh.author_name)) ?? [];
    const overrideId = input.reviewedParentOverrides?.[fresh.recovery_order];
    let posted: LegacyPostedRecord | undefined;
    let usedOverride = false;

    if (candidates.length === 1 && !overrideId) {
      posted = candidates[0];
    } else if (overrideId) {
      posted = candidates.find((candidate) => candidate.youtube_comment_id === overrideId);
      usedOverride = true;
    }

    if (!posted) {
      const detail = candidates.length === 0 ? "no candidate" : `${candidates.length} candidates`;
      throw new RecoveryImportError(
        "legacy_match_invalid",
        `Order ${fresh.recovery_order} (${fresh.author_name}) has ${detail}; a reviewed parent id is required.`
      );
    }
    if (usedParents.has(posted.youtube_comment_id)) {
      throw new RecoveryImportError("legacy_parent_reused", `Parent ${posted.youtube_comment_id} matched more than once.`);
    }
    usedParents.add(posted.youtube_comment_id);

    const evidence = evidenceByComment.get(posted.youtube_comment_id) ?? null;
    if (evidence?.legacy_reply_id && evidence.legacy_reply_id !== posted.legacy_reply_id) {
      throw new RecoveryImportError(
        "legacy_reply_mismatch",
        `Recovery evidence disagrees with posted history for ${posted.youtube_comment_id}.`
      );
    }
    const legacyOutcome: RecoveryLegacyOutcome =
      evidence?.recovery_status === "CONFIRMED_REMOVED"
        ? "CONFIRMED_REMOVED"
        : "POSTED_RECORDED";

    return {
      ...fresh,
      youtube_comment_id: posted.youtube_comment_id,
      legacy_reply_id: posted.legacy_reply_id,
      legacy_draft_text: posted.legacy_draft_text,
      legacy_outcome: legacyOutcome,
      legacy_recovery_evidence: evidence,
      batch02_comment_found: input.batchCommentIds.has(posted.youtube_comment_id),
      reviewed_parent_override_used: usedOverride,
    };
  });
}

export type RecoveryApproveRefusal = "not_drafted" | "removal_unconfirmed" | "already_posted";

export function recoveryApproveRefusal(
  row: Pick<MatchedRecoveryRow, "legacy_outcome"> & { status: RecoveryStatus; posted_reply_id: string | null }
): RecoveryApproveRefusal | null {
  if (row.status !== "DRAFTED") return "not_drafted";
  if (row.legacy_outcome !== "CONFIRMED_REMOVED") return "removal_unconfirmed";
  if (row.posted_reply_id) return "already_posted";
  return null;
}

export function canApproveRecovery(
  row: Pick<MatchedRecoveryRow, "legacy_outcome"> & { status: RecoveryStatus; posted_reply_id: string | null }
): boolean {
  return recoveryApproveRefusal(row) === null;
}
