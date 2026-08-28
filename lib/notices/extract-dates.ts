import type { CandidateDate } from "./review-schema";

/**
 * Candidate date extraction.
 *
 * The single most important property of this file: what it returns are
 * CANDIDATES. A value here means "a date appears in the official text near
 * these words" -- never "KMate accepts this as a deadline". Nothing in the
 * codebase converts this output into a DeadlineRecord; that dataset is
 * source-controlled and only a human editing the repo can add to it.
 *
 * Consequences of that stance, all deliberate:
 *  - Every date the notice prints is captured, including ones whose meaning
 *    is unreadable -- they come back as kind "unclassified", confidence
 *    "low", rather than being dropped. A reviewer seeing a date they must
 *    interpret is safe; a reviewer never shown it is not.
 *  - A year is never supplied. A date printed without one is skipped, since
 *    choosing the year would be inventing the very thing under review.
 *  - Nothing is timezone-shifted. The date is recorded as the notice prints it.
 */

/** Cue words that identify what a nearby date means. Ordered most specific first. */
const KIND_CUES: { kind: CandidateDate["kind"]; patterns: RegExp[] }[] = [
  {
    kind: "final_university_choice",
    patterns: [
      /final (university|univ\.?) (choice|selection|decision)/i,
      /choice of (the )?final university/i,
      // Korean: 최종 대학 선택
      /최종.{0,4}대학.{0,4}(선택|결정)/,
    ],
  },
  {
    kind: "invitation_letter",
    patterns: [
      /invitation letter/i,
      /letter of invitation/i,
      /certificate of admission/i,
      // Korean: 초청장 / 입학허가서
      /초청장/,
      /입학\s*허가서/,
    ],
  },
  {
    kind: "interview",
    patterns: [
      // An interview date is a real, correctly-typed schedule fact. Typing it
      // is what stops it being read as an application deadline -- it used to
      // fall through as "unclassified", which was safe but uninformative.
      /\binterviews?\b/i,
      /\boral (?:test|examination|exam)\b/i,
      /\b면접\b/,
    ],
  },
  {
    kind: "result_announcement",
    patterns: [
      /announcement of (the )?results?/i,
      /results? (will be )?(announced|released|posted)/i,
      /(successful|selected) candidates? (will be )?announced/i,
      /notification of (the )?results?/i,
      /\b(first|second|third|1st|2nd|3rd|final) round result/i,
      // Korean: 합격자 발표 / 선발 결과
      /(합격자|결과).{0,4}발표/,
      /(선발|심사).{0,4}결과/,
    ],
  },
  {
    kind: "document_submission",
    patterns: [
      /(submit|submission|submitting) (of |the )?(required |original |additional )?documents?/i,
      /documents? (must be |should be |to be )?(submitted|sent|received)/i,
      /original documents?/i,
      // Korean: 서류 제출 / 원본 제출
      /서류.{0,4}(제출|접수)/,
      /(원본|증빙).{0,4}제출/,
    ],
  },
  {
    kind: "application_deadline",
    patterns: [
      /application (period|deadline|due|closes?|closing)/i,
      /deadline (for|of) (the )?application/i,
      /applications? (must be |are )?(received|submitted|accepted) (by|until|no later than)/i,
      /closing date/i,
      /due (date|by)/i,
      /no later than/i,
      /\bdeadline\b/i,
      // Korean: 접수 마감 / 신청 기한 / 지원 마감
      /(접수|신청|지원|원서).{0,4}(마감|기한|기간)/,
      /마감\s*(일|일자|시한)/,
    ],
  },
];

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Rejects impossible calendar dates (2026-02-31) rather than letting Date roll them over. */
function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Date shapes actually seen on this board. Every pattern requires an explicit
 * 4-digit year -- see the note above on why a missing year is a skip.
 */
const DATE_PATTERNS: { re: RegExp; build: (m: RegExpMatchArray) => string | null }[] = [
  // 2026-01-02 / 2026.01.02 / 2026/01/02
  {
    re: /\b(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\.?\b/g,
    build: (m) => {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return isRealDate(y, mo, d) ? iso(y, mo, d) : null;
    },
  },
  // 2 January 2026 / 2nd Jan 2026
  {
    re: /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/g,
    build: (m) => {
      const mo = MONTHS[m[2].toLowerCase()];
      const [d, y] = [Number(m[1]), Number(m[3])];
      return mo && isRealDate(y, mo, d) ? iso(y, mo, d) : null;
    },
  },
  // January 2, 2026 / Jan. 2 2026
  {
    re: /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g,
    build: (m) => {
      const mo = MONTHS[m[1].toLowerCase()];
      const [d, y] = [Number(m[2]), Number(m[3])];
      return mo && isRealDate(y, mo, d) ? iso(y, mo, d) : null;
    },
  },
  // Korean: 2026년 1월 2일
  {
    re: /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g,
    build: (m) => {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return isRealDate(y, mo, d) ? iso(y, mo, d) : null;
    },
  },
];

/**
 * The line a date sits on, as [start, end) offsets into the full text.
 *
 * Classification is confined to this span, and that boundary is the whole
 * safety property of this file. Official notices list dates one per line:
 *
 *     The application deadline is 2026-10-31.
 *     Results will be announced on 2026-12-20.
 *
 * A fixed character radius reaches across that newline and lets the NEXT
 * line's cue label the previous line's date -- turning a deadline into a
 * "result announcement" in front of a reviewer. Confining the search to the
 * date's own line is what stops one notice line from speaking for another.
 */
function lineBoundsAt(text: string, index: number): [number, number] {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  const nl = text.indexOf("\n", index);
  return [start, nl === -1 ? text.length : nl];
}

/** Longest display context kept around a date, in characters per side. */
const CONTEXT_RADIUS = 90;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Finds the cue nearest the date within `span`.
 *
 * Nearest wins rather than first-listed: a line reading "documents for the
 * final university choice must be submitted by <date>" contains two cues, and
 * the one actually governing the date is the one closest to it. A fixed rule
 * ordering would always pick the same cue regardless of where it sat.
 */
function nearestCue(
  span: string,
  dateStart: number,
  dateEnd: number
): { kind: CandidateDate["kind"]; distance: number } | null {
  let best: { kind: CandidateDate["kind"]; distance: number } | null = null;

  for (const cue of KIND_CUES) {
    for (const pattern of cue.patterns) {
      const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
      for (const m of span.matchAll(re)) {
        const at = m.index ?? 0;
        const end = at + m[0].length;
        // Distance from the cue to the date, zero when they overlap.
        const distance = end <= dateStart ? dateStart - end : at >= dateEnd ? at - dateEnd : 0;
        if (!best || distance < best.distance) best = { kind: cue.kind, distance };
      }
    }
  }
  return best;
}

/**
 * How near a cue must sit, in characters, to count as clearly governing the
 * date rather than merely sharing a line with it.
 */
const TIGHT_DISTANCE = 45;

/**
 * Extracts every explicit calendar date from the notice body as a candidate.
 *
 * De-duplicated on date + kind so a date repeated in a table doesn't produce
 * a wall of identical rows for the reviewer; the first occurrence's context
 * is kept. Returned in the order they appear in the notice.
 */
export function extractCandidateDates(text: string, sourceUrl: string, limit = 40): CandidateDate[] {
  if (!text) return [];

  const found: (CandidateDate & { at: number })[] = [];
  const seen = new Set<string>();

  for (const { re, build } of DATE_PATTERNS) {
    // Fresh lastIndex per call -- these are module-level /g regexes.
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const date = build(m);
      if (!date) continue;
      const at = m.index ?? 0;
      const end = at + m[0].length;

      // Classification never leaves the date's own line.
      const [lineStart, lineEnd] = lineBoundsAt(text, at);
      const line = text.slice(lineStart, lineEnd);
      const cue = nearestCue(line, at - lineStart, end - lineStart);

      const kind = cue ? cue.kind : "unclassified";
      const confidence: CandidateDate["confidence"] = !cue
        ? "low"
        : cue.distance <= TIGHT_DISTANCE
          ? "high"
          : "medium";

      // Display context may show a little of the surrounding text, clamped to
      // the line so a reviewer reads the date in its own sentence.
      const context = squash(
        text.slice(Math.max(lineStart, at - CONTEXT_RADIUS), Math.min(lineEnd, end + CONTEXT_RADIUS))
      );

      const key = `${date}|${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);

      found.push({ date, kind, context, rawMatch: m[0], sourceUrl, confidence, at });
    }
  }

  return found
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map((c) => ({
      date: c.date,
      kind: c.kind,
      context: c.context,
      rawMatch: c.rawMatch,
      sourceUrl: c.sourceUrl,
      confidence: c.confidence,
    }));
}
