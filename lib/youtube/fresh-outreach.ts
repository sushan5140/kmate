import type { ImportCandidate } from "./import";
import { featureTagsFor, opportunityTypeFrom, priorityFromImport, promotionCategoryOf } from "./classify";

export const FRESH_BATCH_SIZE = 5;
export const FRESH_IMPORT_LIMIT = 200;
export const FRESH_TOPIC_PREFIX = "FRESH:";

export type FreshProduct = "KMATE" | "HALLIUM" | "VIDEOLAB";

export interface FreshRawRow {
  comment_published_at: string | null;
  author: string | null;
  comment_text: string;
  like_count: number;
  reply_count: number;
  comment_id: string;
  video_id: string | null;
  video_title: string | null;
  channel_title: string | null;
  matched_searches: string | null;
  comment_url: string | null;
}

export interface FreshScoredRow extends FreshRawRow {
  product: FreshProduct;
  score: number;
  reason: string;
}

const clean = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => clean(value).toLowerCase();
const number = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const instant = (value: unknown): string | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const raw = clean(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const PRAISE_ONLY = /^(thanks?|thank you|nice|great|amazing|wow|love it|❤️|❤|😂|🤣|[1-5]\/5)[!. ❤️😂🤣]*$/i;
const QUESTION = /\?|\b(how|what|which|where|when|why|can i|can we|could i|should i|is there|do i|does|please|plz|help|guide)\b/i;
const GKS = /\b(gks|kgsp|global korea scholarship|scholarship|embassy track|university track|niied|study in korea)\b/i;
const GKS_INTENT = /\b(application|apply|eligib|age limit|ielts|topik|transcript|apostille|recommendation|lor|document|deadline|major|university|interview|form|submission|marks?|percentage|graduat)\w*/i;
const KOREAN = /\b(korean|hangul|hangeul|topik|learn korean|study korean)\b/i;
const KOREAN_NEED = /\b(beginner|pronunciation|sound|speak|speaking|listen|listening|grammar|particle|vocab|vocabulary|write|writing|read|reading|difficult|hard|struggle|confus|understand|practice)\w*/i;
const VIDEO = /\b(listening|subtitle|caption|k-?drama|video|conversation|comprehension|podcast|vlog|native speech)\b/i;
const PROMO = /(https?:\/\/|www\.|subscribe|follow for|buymeacoffee|forms\.gle|our channel|check out)/i;

export function parseFreshMatrix(matrix: unknown[][]): FreshRawRow[] {
  if (!Array.isArray(matrix) || matrix.length < 2) return [];
  const headers = (matrix[0] ?? []).map((v) => lower(v));
  const col = (name: string) => headers.indexOf(name);
  const required = ["comment_text", "comment_id"];
  if (required.some((name) => col(name) < 0)) return [];

  const get = (row: unknown[], name: string) => {
    const i = col(name);
    return i < 0 ? null : row[i];
  };

  return matrix.slice(1).flatMap((row) => {
    const commentId = clean(get(row, "comment_id"));
    const commentText = clean(get(row, "comment_text"));
    if (!commentId || !commentText) return [];
    return [{
      comment_published_at: instant(get(row, "comment_published_at")),
      author: clean(get(row, "author")) || null,
      comment_text: commentText,
      like_count: number(get(row, "like_count")),
      reply_count: number(get(row, "reply_count")),
      comment_id: commentId,
      video_id: clean(get(row, "video_id")) || null,
      video_title: clean(get(row, "video_title")) || null,
      channel_title: clean(get(row, "channel_title")) || null,
      matched_searches: clean(get(row, "matched_searches")) || null,
      comment_url: clean(get(row, "comment_url")) || null,
    }];
  });
}

export function scoreFreshRow(row: FreshRawRow): FreshScoredRow | null {
  const comment = row.comment_text.trim();
  const context = `${row.video_title ?? ""} ${row.matched_searches ?? ""}`;
  if (comment.length < 6 || PRAISE_ONLY.test(comment) || PROMO.test(comment)) return null;

  const isGks = GKS.test(context) || GKS.test(comment);
  const isKorean = KOREAN.test(context) || KOREAN.test(comment);
  const asks = QUESTION.test(comment);

  if (isGks && (asks || GKS_INTENT.test(comment))) {
    let score = 65;
    if (asks) score += 15;
    if (GKS_INTENT.test(comment)) score += 12;
    if (row.reply_count === 0) score += 5;
    if (row.like_count > 0) score += Math.min(3, row.like_count);
    return { ...row, product: "KMATE", score: Math.min(100, score), reason: "specific GKS/application intent" };
  }

  if (isKorean && (asks || KOREAN_NEED.test(comment))) {
    const product: FreshProduct = VIDEO.test(comment) || VIDEO.test(context) ? "VIDEOLAB" : "HALLIUM";
    let score = 60;
    if (asks) score += 15;
    if (KOREAN_NEED.test(comment)) score += 10;
    if (row.reply_count === 0) score += 5;
    if (row.like_count > 0) score += Math.min(3, row.like_count);
    return {
      ...row,
      product,
      score: Math.min(100, score),
      reason: product === "VIDEOLAB" ? "listening/video/comprehension intent" : "general Korean-learning intent",
    };
  }

  return null;
}

export function shortlistFreshRows(rows: FreshRawRow[], limit = FRESH_IMPORT_LIMIT): FreshScoredRow[] {
  const seen = new Set<string>();
  return rows
    .map(scoreFreshRow)
    .filter((row): row is FreshScoredRow => Boolean(row))
    .filter((row) => {
      const key = row.comment_text.toLowerCase().replace(/\W+/g, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function freshToCandidate(row: FreshScoredRow, spreadsheetRow: number): ImportCandidate {
  const topic = `${FRESH_TOPIC_PREFIX}${row.product}`;
  return {
    spreadsheet_row: spreadsheetRow,
    youtube_comment_id: row.comment_id,
    parent_comment_id: null,
    video_id: row.video_id,
    video_title: row.video_title,
    channel_title: row.channel_title,
    source_url: row.comment_url,
    author_name: row.author,
    original_text: row.comment_text,
    source_type: "comment",
    topic,
    score: row.score,
    confidence: row.score >= 90 ? "High" : row.score >= 75 ? "Medium" : "Low",
    reply_status: row.reason,
    general_reply: null,
    kmate_reply: null,
    use_kmate: row.product === "KMATE",
    best_choice: row.product,
    final_draft: null,
    automation_action: null,
    discovered_at: new Date().toISOString(),
    comment_posted_at: row.comment_published_at,
    priority: priorityFromImport(row.score >= 90 ? "High" : row.score >= 75 ? "Medium" : "Low", row.score),
    opportunity_type: opportunityTypeFrom(row.comment_text, topic),
    promotion_category: promotionCategoryOf(null),
    feature_tags: row.product === "KMATE" ? featureTagsFor(row.comment_text, topic) : [],
    status: "SCRAPED",
    eligible: false,
  };
}

export function productFromTopic(topic: string | null): FreshProduct | null {
  if (!topic?.startsWith(FRESH_TOPIC_PREFIX)) return null;
  const value = topic.slice(FRESH_TOPIC_PREFIX.length);
  return value === "KMATE" || value === "HALLIUM" || value === "VIDEOLAB" ? value : null;
}
