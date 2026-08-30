/**
 * Turning an uploaded spreadsheet into queue rows.
 *
 * Pure module -- takes a matrix of cells, returns plain objects. The XLSX
 * decoding itself lives in the route handler, so this logic (which is where
 * the eligibility rules live) is directly testable without a file.
 *
 * The eligibility rule is inherited unchanged from the Python bot it
 * replaces, because it was correct there:
 *
 *     source_type == "comment"  &&  automation_action == "POST"
 *     &&  comment_id  &&  final_draft
 *
 * What changed is the consequence. In the bot, eligible meant "post it now,
 * in bulk". Here it means DRAFTED -- visible to an admin, awaiting a click.
 * HOLD and SKIP rows are imported too, so the sheet's full history stays
 * visible, and they land in states that can never be approved.
 */

import type { YoutubeReplyStatus } from "./queue-schema";
import {
  featureTagsFor,
  opportunityTypeFrom,
  priorityFromImport,
  promotionCategoryOf,
  type KmateFeature,
  type OpportunityType,
  type Priority,
  type PromotionCategory,
} from "./classify";

/** The only columns read out of the sheet. Anything else is ignored. */
export const ALLOWED_COLUMNS = [
  "source_type",
  "video_id",
  "video_title",
  "channel_title",
  "source_url",
  "comment_id",
  "parent_comment_id",
  "username",
  "raw_text",
  "topic",
  "captured_at",
  "posted_at",
  "score",
  "confidence",
  "reply_status",
  "general_reply",
  "kmate_reply",
  "use_kmate",
  "best_choice",
  "final_draft",
  "automation_action",
] as const;

/** Columns without which a row cannot be identified at all. */
const HEADER_MARKERS = ["comment_id", "final_draft"];

/** How far into the sheet to look for the header before giving up. */
const MAX_HEADER_SCAN_ROWS = 25;

export type Cell = string | number | boolean | Date | null | undefined;
export type SheetMatrix = Cell[][];

export interface ImportCandidate {
  spreadsheet_row: number;
  youtube_comment_id: string;
  parent_comment_id: string | null;
  video_id: string | null;
  video_title: string | null;
  channel_title: string | null;
  source_url: string | null;
  author_name: string | null;
  original_text: string | null;
  source_type: string | null;
  topic: string | null;
  score: number | null;
  confidence: string | null;
  reply_status: string | null;
  general_reply: string | null;
  kmate_reply: string | null;
  use_kmate: boolean | null;
  best_choice: string | null;
  final_draft: string | null;
  automation_action: string | null;
  discovered_at: string | null;
  comment_posted_at: string | null;
  priority: Priority;
  opportunity_type: OpportunityType;
  promotion_category: PromotionCategory;
  feature_tags: KmateFeature[];
  status: YoutubeReplyStatus;
  eligible: boolean;
}

export interface SkippedRow {
  spreadsheet_row: number;
  reason: "no_comment_id" | "blank_row";
}

export interface ParsedSheet {
  headerRowIndex: number;
  totalRows: number;
  candidates: ImportCandidate[];
  skipped: SkippedRow[];
}

export class SheetFormatError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "SheetFormatError";
  }
}

const text = (cell: Cell): string | null => {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date) return cell.toISOString();
  const s = String(cell).trim();
  return s.length ? s : null;
};

/**
 * A cell that should be an instant. Excel may hand back a Date object or the
 * ISO string the scout wrote; anything unparseable becomes null rather than a
 * guessed timestamp, because a wrong discovered_at would put a row in the
 * wrong day for the rest of its life.
 */
const instant = (cell: Cell): string | null => {
  if (cell === null || cell === undefined || cell === "") return null;
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? null : cell.toISOString();
  const parsed = new Date(String(cell).trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const num = (cell: Cell): number | null => {
  if (cell === null || cell === undefined || cell === "") return null;
  const n = typeof cell === "number" ? cell : Number(String(cell).trim());
  return Number.isFinite(n) ? n : null;
};

/** 'Yes'/'No', 'TRUE'/'FALSE', 1/0 -- anything else is "the sheet did not say". */
const bool = (cell: Cell): boolean | null => {
  if (cell === null || cell === undefined || cell === "") return null;
  if (typeof cell === "boolean") return cell;
  const s = String(cell).trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return null;
};

const upper = (cell: Cell): string | null => text(cell)?.toUpperCase() ?? null;
const lower = (cell: Cell): string | null => text(cell)?.toLowerCase() ?? null;

/**
 * Finds the header row instead of assuming row 4.
 *
 * The current export happens to put it there, under three title rows, but
 * that is a property of one report generator and not a contract. Scanning for
 * a row that actually contains the marker columns means a regenerated or
 * re-laid-out sheet keeps working.
 */
export function detectHeaderRow(matrix: SheetMatrix): number {
  const limit = Math.min(matrix.length, MAX_HEADER_SCAN_ROWS);
  for (let i = 0; i < limit; i++) {
    const cells = (matrix[i] ?? []).map((c) => lower(c) ?? "");
    if (HEADER_MARKERS.every((marker) => cells.includes(marker))) return i;
  }
  return -1;
}

/** header name -> column index, restricted to the allow-list. */
export function mapHeaderColumns(headerRow: Cell[]): Map<string, number> {
  const allowed = new Set<string>(ALLOWED_COLUMNS);
  const map = new Map<string, number>();
  headerRow.forEach((cell, index) => {
    const name = lower(cell);
    // First occurrence wins, so a duplicated header cannot silently shadow.
    if (name && allowed.has(name) && !map.has(name)) map.set(name, index);
  });
  return map;
}

/**
 * The initial status for an imported row.
 *
 * Eligible rows arrive DRAFTED, never APPROVED: import is not a decision.
 * Everything else keeps the sheet's own verdict, in a state `approveRefusal`
 * refuses, so importing the full sheet cannot make a HOLD row postable.
 */
export function initialStatusFor(
  eligible: boolean,
  automationAction: string | null
): YoutubeReplyStatus {
  if (eligible) return "DRAFTED";
  if (automationAction === "HOLD") return "HOLD";
  if (automationAction === "SKIP") return "SKIP";
  return "SCRAPED";
}

export function parseSheet(matrix: SheetMatrix): ParsedSheet {
  const headerRowIndex = detectHeaderRow(matrix);
  if (headerRowIndex < 0) {
    throw new SheetFormatError(
      "header_not_found",
      "No header row containing comment_id and final_draft was found in the first " +
        MAX_HEADER_SCAN_ROWS +
        " rows."
    );
  }

  const columns = mapHeaderColumns(matrix[headerRowIndex] ?? []);
  for (const marker of HEADER_MARKERS) {
    if (!columns.has(marker)) {
      throw new SheetFormatError("missing_column", `Required column "${marker}" is missing.`);
    }
  }

  const at = (row: Cell[], name: string): Cell => {
    const index = columns.get(name);
    return index === undefined ? null : row[index];
  };

  const candidates: ImportCandidate[] = [];
  const skipped: SkippedRow[] = [];
  let totalRows = 0;

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    // 1-based, matching what the spreadsheet application shows.
    const spreadsheet_row = i + 1;

    if (row.every((cell) => text(cell) === null)) continue;
    totalRows++;

    const youtube_comment_id = text(at(row, "comment_id"));
    if (!youtube_comment_id) {
      // Without the parent comment id there is nothing to reply to and no
      // dedupe key. Recorded as skipped rather than dropped silently.
      skipped.push({ spreadsheet_row, reason: "no_comment_id" });
      continue;
    }

    const source_type = lower(at(row, "source_type"));
    const automation_action = upper(at(row, "automation_action"));
    const final_draft = text(at(row, "final_draft"));

    const eligible =
      source_type === "comment" && automation_action === "POST" && Boolean(final_draft);

    candidates.push({
      spreadsheet_row,
      youtube_comment_id,
      parent_comment_id: text(at(row, "parent_comment_id")),
      video_id: text(at(row, "video_id")),
      video_title: text(at(row, "video_title")),
      channel_title: text(at(row, "channel_title")),
      source_url: text(at(row, "source_url")),
      author_name: text(at(row, "username")),
      original_text: text(at(row, "raw_text")),
      source_type,
      topic: text(at(row, "topic")),
      score: num(at(row, "score")),
      confidence: text(at(row, "confidence")),
      reply_status: text(at(row, "reply_status")),
      general_reply: text(at(row, "general_reply")),
      kmate_reply: text(at(row, "kmate_reply")),
      use_kmate: bool(at(row, "use_kmate")),
      best_choice: text(at(row, "best_choice")),
      final_draft,
      automation_action,
      // The scout's capture time is the row's birthday, and the daily
      // workspace is built on it. Falling back to null (not "now") keeps a
      // sheet without the column out of today's counts rather than flooding
      // them; the insert layer supplies created_at as the last resort.
      discovered_at: instant(at(row, "captured_at")),
      comment_posted_at: instant(at(row, "posted_at")),
      priority: priorityFromImport(text(at(row, "confidence")), num(at(row, "score"))),
      opportunity_type: opportunityTypeFrom(text(at(row, "raw_text")), text(at(row, "topic"))),
      // Read off the draft the sheet supplies. Descriptive only -- it never
      // changes the text and never makes a row more or less postable.
      promotion_category: promotionCategoryOf(final_draft),
      feature_tags: featureTagsFor(text(at(row, "raw_text")), text(at(row, "topic"))),
      status: initialStatusFor(eligible, automation_action),
      eligible,
    });
  }

  return { headerRowIndex, totalRows, candidates, skipped };
}

// ---------------------------------------------------------------------------
// Legacy import -- the old bot's posted_replies.json
// ---------------------------------------------------------------------------

/**
 * The bot's file is a flat object keyed by the PARENT comment id, which is
 * exactly this queue's dedupe key. Its values look like:
 *
 *   { author, reply, reply_id, spreadsheet_row, video_id }
 *
 * Importing it is what stops a comment the bot already answered from being
 * answered a second time. Those replies were posted; many were later removed.
 * Both facts are worth keeping, and neither is a reason to try again.
 */
export interface LegacyRecord {
  youtube_comment_id: string;
  posted_reply_id: string | null;
  author_name: string | null;
  final_draft: string | null;
  video_id: string | null;
  spreadsheet_row: number | null;
}

export interface ParsedLegacy {
  records: LegacyRecord[];
  skipped: number;
}

export function parseLegacyPostedReplies(raw: unknown): ParsedLegacy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SheetFormatError("legacy_not_object", "Expected a JSON object keyed by comment id.");
  }

  const records: LegacyRecord[] = [];
  let skipped = 0;

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const commentId = key.trim();
    if (!commentId) {
      skipped++;
      continue;
    }
    const v = (value ?? {}) as Record<string, unknown>;
    const replyId = typeof v.reply_id === "string" ? v.reply_id.trim() : "";
    const sheetRow = Number(v.spreadsheet_row);

    records.push({
      youtube_comment_id: commentId,
      posted_reply_id: replyId.length ? replyId : null,
      author_name: typeof v.author === "string" ? v.author : null,
      final_draft: typeof v.reply === "string" ? v.reply : null,
      video_id: typeof v.video_id === "string" ? v.video_id : null,
      spreadsheet_row: Number.isInteger(sheetRow) ? sheetRow : null,
    });
  }

  return { records, skipped };
}

/**
 * Where a legacy record lands.
 *
 * A recorded reply id means the bot's call was accepted -- the same fact
 * API_ACCEPTED carries for a new post, and just as unconfirmed. The direct-id
 * audit showed most of these are gone, so they are marked unverified and left
 * for an explicit check rather than assumed live. `is_legacy` keeps the
 * distinction visible in the UI and blocks posting independently of status.
 *
 * A record with no reply id is a comment the bot touched but never
 * successfully replied to. It becomes SKIP: still not postable, because
 * re-attempting the old bot's work is not what this tool is for.
 */
export function legacyStatusFor(record: LegacyRecord): YoutubeReplyStatus {
  return record.posted_reply_id ? "API_ACCEPTED" : "SKIP";
}
