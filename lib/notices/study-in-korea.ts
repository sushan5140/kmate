import "server-only";
import { createHash } from "node:crypto";

/**
 * Source adapter for the official Study in Korea announcement board
 * (studyinkorea.go.kr, operated by NIIED). Phase 1 retrieval is plain HTTP
 * + HTML parsing -- deliberately no headless browser and no Crawl4AI.
 *
 * Retrieval notes, all established by probing the live site rather than
 * assumed:
 *  - Both the list page and the notice detail pages return full server-
 *    rendered HTML to an ordinary GET with no cookie, no referer and no
 *    session of any kind. No cookie/referer dance is required here.
 *  - The board's own links are JS-triggered -- `noticeRead(nttId, bbsId)`
 *    builds a POST form to /{lang}/community/noticeRead.do. That POST is
 *    NOT what we store: the same handler also answers a plain GET with the
 *    same two parameters as a querystring, verified to return the real
 *    detail page cold. That GET form is what goes in source_url, so every
 *    stored link is one a user can actually click.
 *
 * No parsed field is ever inferred or defaulted to a plausible-looking
 * value: anything the markup doesn't state comes back null.
 */

const BASE = "https://www.studyinkorea.go.kr";
export const STUDY_IN_KOREA_NOTICE_URL = `${BASE}/en/community/noticeList.do`;
export const STUDY_IN_KOREA_DOMAIN = "www.studyinkorea.go.kr";

// Identifies the crawler honestly rather than impersonating a browser. The
// site serves this endpoint fine without any UA at all; this is courtesy,
// not a workaround.
const USER_AGENT = "KMate-NoticeMonitor/1.0 (+https://kmate.vercel.app; GKS applicant notice index)";

export interface NoticeListItem {
  nttId: string;
  bbsId: string;
  title: string;
  /** YYYY-MM-DD, or null when the row states no date. Never inferred. */
  publishedDate: string | null;
  sourceUrl: string;
}

export interface NoticeDetail {
  /** Inner HTML of the official notice body, exactly as served. */
  originalText: string;
  /** Same content with tags/entities reduced to plain text. */
  cleanText: string;
  /** Title as shown on the detail page itself, null if absent. */
  detailTitle: string | null;
  /** Date as shown on the detail page itself, null if absent. */
  detailDate: string | null;
}

/**
 * Named HTML entities seen in (or plausibly present in) this board's notices.
 * Kept as an explicit table rather than pulling in an entity-decoding
 * dependency for Phase 1. An unlisted entity is deliberately left as-is
 * rather than stripped -- a visible "&foo;" is an honest signal that this
 * table needs extending, whereas silently deleting it would quietly corrupt
 * the official text.
 */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  middot: "·", bull: "•", hellip: "…", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»", times: "×", divide: "÷", deg: "°", plusmn: "±",
  frac12: "½", frac14: "¼", frac34: "¾", sup1: "¹", sup2: "²", sup3: "³",
  copy: "©", reg: "®", trade: "™", sect: "§", para: "¶", micro: "µ",
  dagger: "†", Dagger: "‡", permil: "‰", prime: "′", Prime: "″",
  euro: "€", pound: "£", yen: "¥", cent: "¢", ordm: "º", ordf: "ª",
  iexcl: "¡", iquest: "¿", larr: "←", rarr: "→", harr: "↔",
  uarr: "↑", darr: "↓", ne: "≠", le: "≤", ge: "≥", asymp: "≈",
};

function decodeEntities(input: string): string {
  return (
    input
      // Numeric forms first.
      .replace(/&#(\d+);/g, (m, d: string) => {
        const n = Number(d);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (m, h: string) => {
        const n = parseInt(h, 16);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
      })
      // Then named forms. `&amp;` resolving to "&" in the same single pass
      // is what keeps a literal "&amp;lt;" from collapsing to "<".
      .replace(/&([a-zA-Z][a-zA-Z0-9]{1,10});/g, (m, name: string) =>
        Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : m
      )
  );
}

/** Tags -> plain text, preserving block/line breaks as newlines. */
export function htmlToCleanText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "")
      // Drop a trailing unterminated tag. When a caller slices HTML on a
      // marker (the SNU adapter cuts sections at the next heading widget),
      // the slice can end mid-tag; with no closing ">" the tag-stripper below
      // can't match it and it would leak into the text as literal markup.
      .replace(/<[^>]*$/, "")
      .replace(/<br\s*\/?>/gi, "\n")
      // Break on OPENING block tags as well as closing ones. A nested list
      // ("<li>Amount of Scholarship<ul><li>Liberal Arts...") emits no closing
      // tag between the parent's label and its first child, so closing-tag
      // handling alone fuses them into "Amount of ScholarshipLiberal Arts" --
      // text the source never shows.
      .replace(/<(ul|ol|li|tr|td|th|dt|dd|table|h[1-6])\b[^>]*>/gi, "\n$&")
      // Cell/term-level closing tags break too, not just row-level ones.
      .replace(/<\/(p|div|li|tr|td|th|dt|dd|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Deterministic script check, NOT a language-guessing model: true when the
 * string contains any Hangul syllable/jamo codepoint. Used to record
 * `language`, which the board does not state per-notice -- see the note on
 * detectLanguage below.
 */
function containsHangul(text: string): boolean {
  return /[가-힣ᄀ-ᇿ㄰-㆏]/.test(text);
}

/**
 * The board publishes no per-notice language metadata, so this is a
 * measurement of the stored text rather than a claim sourced from the site:
 * 'ko' when the text contains Hangul, 'en' when it contains Latin letters
 * and no Hangul, and null when neither test is conclusive (rather than
 * defaulting to a guess). Many notices are genuinely bilingual and are
 * recorded as 'ko' because Hangul is present -- it is not a claim that no
 * English exists in the body.
 */
export function detectLanguage(text: string): "ko" | "en" | null {
  if (containsHangul(text)) return "ko";
  if (/[A-Za-z]/.test(text)) return "en";
  return null;
}

/**
 * Verbatim leading excerpt of the notice body -- deliberately NOT a
 * generated or paraphrased summary. Phase 1 must not introduce any wording
 * that isn't in the official source, so this can only ever quote it. Cuts
 * on a word boundary and appends an ellipsis when truncated.
 */
export function excerptSummary(cleanText: string, maxLen = 280): string | null {
  const flat = cleanText.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  if (flat.length <= maxLen) return flat;
  const cut = flat.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`fetch ${url} failed: HTTP ${res.status}`);
  return res.text();
}

/** GET form of the detail page -- verified to work with no session. */
export function buildNoticeUrl(nttId: string, bbsId: string): string {
  return `${BASE}/en/community/noticeRead.do?nttId=${encodeURIComponent(nttId)}&bbsId=${encodeURIComponent(bbsId)}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses the announcement list. Each row is an anchor carrying
 * `onclick="noticeRead('<nttId>', '<bbsId>')"`, a `<p class="title">` and a
 * `<span class="date">`. A row missing an id pair or a title is skipped
 * outright rather than stored with invented values.
 */
export function parseNoticeList(html: string): NoticeListItem[] {
  const items: NoticeListItem[] = [];
  const anchorRe = /<a\b[^>]*class="[^"]*board-text-item[^"]*"[^>]*onclick="noticeRead\('([^']+)',\s*'([^']+)'\)"[\s\S]*?<\/a>/g;

  for (const m of html.matchAll(anchorRe)) {
    const [block, nttId, bbsId] = m;
    const titleMatch = block.match(/<p\b[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const title = titleMatch ? htmlToCleanText(titleMatch[1]) : "";
    if (!nttId || !bbsId || !title) continue;

    const dateMatch = block.match(/<span\b[^>]*class="[^"]*\bdate\b[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    const rawDate = dateMatch ? htmlToCleanText(dateMatch[1]) : "";
    const publishedDate = DATE_RE.test(rawDate) ? rawDate : null;

    items.push({ nttId, bbsId, title, publishedDate, sourceUrl: buildNoticeUrl(nttId, bbsId) });
  }
  return items;
}

export function parseNoticeDetail(html: string): NoticeDetail {
  const bodyMatch = html.match(/<div\b[^>]*class="[^"]*board-detail-body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class="[^"]*link-wrap/);
  const fallbackBody = html.match(/<div\b[^>]*class="[^"]*board-detail-body[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  const originalText = (bodyMatch?.[1] ?? fallbackBody?.[1] ?? "").trim();

  const headerMatch = html.match(/<div\b[^>]*class="[^"]*board-detail-header[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/);
  const detailTitle = headerMatch ? htmlToCleanText(headerMatch[1]) || null : null;

  const utilMatch = html.match(/<div\b[^>]*class="[^"]*board-detail-utility[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  const dateMatch = utilMatch?.[1].match(/<span\b[^>]*class="[^"]*\bdate\b[^"]*"[^>]*>([\s\S]*?)<\/span>/);
  const rawDetailDate = dateMatch ? htmlToCleanText(dateMatch[1]) : "";

  return {
    originalText,
    cleanText: htmlToCleanText(originalText),
    detailTitle,
    detailDate: DATE_RE.test(rawDetailDate) ? rawDetailDate : null,
  };
}

export async function fetchNoticeList(): Promise<NoticeListItem[]> {
  return parseNoticeList(await fetchText(STUDY_IN_KOREA_NOTICE_URL));
}

export async function fetchNoticeDetail(sourceUrl: string): Promise<NoticeDetail> {
  return parseNoticeDetail(await fetchText(sourceUrl));
}
