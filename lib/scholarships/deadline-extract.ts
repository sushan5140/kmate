/**
 * Structured deadline extraction for university scholarship pages.
 *
 * Replaces the previous rule, which was simply "the first date appearing
 * anywhere in the apply section is the deadline". That was wrong in both
 * directions at once: too permissive, because a result or interview date in
 * the same paragraph would be stored as an application deadline; and useless
 * in practice, because the registered sources write "Application Period :
 * January" -- a month with no day and no year, which no full-date pattern
 * matches. Every scholarship in the database currently has deadline = NULL.
 *
 * The rule here is narrower and explicit: a date becomes a `fixed` deadline
 * only when the page states a COMPLETE calendar date AND labels it with
 * closing wording. Everything else stays null.
 *
 * What is deliberately never done:
 *   - no year is ever supplied for a date that omits one
 *   - no month-only or range-only text becomes a date
 *   - a result / interview / announcement / orientation date is never read
 *     as an application deadline
 *   - an admission-schedule sentence never becomes a fixed date
 *   - an open-ended range ("from 1 March") never becomes a closing date
 */

export type ScholarshipDeadlineType = "fixed" | "admission_schedule" | "automatic";

export interface DeadlineExtraction {
  /** ISO YYYY-MM-DD, only for `fixed`. Null in every other case. */
  deadline: string | null;
  deadlineType: ScholarshipDeadlineType | null;
  /** The page's own wording for this date, verbatim. Null when none applies. */
  deadlineLabel: string | null;
  /** How legible the evidence was. Never a claim that the date is correct. */
  confidence: number;
  /** Verbatim source sentence the decision was made from. */
  evidence: string | null;
}

const EMPTY: DeadlineExtraction = {
  deadline: null,
  deadlineType: null,
  deadlineLabel: null,
  confidence: 0,
  evidence: null,
};

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

interface FoundDate {
  date: string;
  /** Offset of the match within the scanned text, for proximity scoring. */
  at: number;
  raw: string;
}

/**
 * Every COMPLETE date in the text. A complete date needs an explicit
 * four-digit year -- "15 September" is not a date here, because supplying
 * the year would be inventing the single most consequential digit.
 */
export function findCompleteDates(text: string): FoundDate[] {
  const found: FoundDate[] = [];
  const push = (date: string | null, at: number, raw: string) => {
    if (date) found.push({ date, at, raw });
  };

  const patterns: { re: RegExp; build: (m: RegExpMatchArray) => string | null }[] = [
    // 2026-09-15 / 2026.09.15 / 2026/9/15
    {
      re: /\b(20\d{2})[-.\/](0?[1-9]|1[0-2])[-.\/](0?[1-9]|[12]\d|3[01])\b/g,
      build: (m) => {
        const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
        return isRealDate(y, mo, d) ? iso(y, mo, d) : null;
      },
    },
    // September 15, 2026 / Sept 15 2026
    {
      re: /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/g,
      build: (m) => {
        const mo = MONTHS[m[1].toLowerCase()];
        const [d, y] = [Number(m[2]), Number(m[3])];
        return mo && isRealDate(y, mo, d) ? iso(y, mo, d) : null;
      },
    },
    // 15 September 2026 / 15th Sept, 2026
    {
      re: /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(20\d{2})\b/g,
      build: (m) => {
        const mo = MONTHS[m[2].toLowerCase()];
        const [d, y] = [Number(m[1]), Number(m[3])];
        return mo && isRealDate(y, mo, d) ? iso(y, mo, d) : null;
      },
    },
  ];

  for (const { re, build } of patterns) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) push(build(m), m.index ?? 0, m[0]);
  }
  // De-duplicate identical dates found by more than one pattern.
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .filter((f) => (seen.has(f.date) ? false : (seen.add(f.date), true)));
}

/**
 * Wording that marks a date as the moment applications CLOSE.
 *
 * "Application period" is deliberately absent: a period has two ends, and
 * which one a lone date represents is exactly the ambiguity this module
 * refuses to resolve. Ranges are handled separately below.
 */
const CLOSING_CUES = [
  /\bapplication deadline\b/i,
  /\bdeadline for (?:applications?|submission|applying)\b/i,
  /\bsubmission deadline\b/i,
  /\bapplications? (?:close|closes|closing)\b/i,
  /\bclosing date\b/i,
  /\bdue (?:date|by)\b/i,
  /\bmust be (?:submitted|received) (?:by|no later than)\b/i,
  /\bno later than\b/i,
  /\bdeadline\s*[:：]/i,
  /\bextended (?:to|until)\b/i,
  /\bdeadline (?:has been )?extended\b/i,
];

/**
 * Wording that marks a date as something OTHER than an application deadline.
 * If one of these sits closer to the date than any closing cue, the date is
 * refused outright rather than stored with a lower confidence -- an
 * announcement date recorded as a deadline is worse than no deadline at all.
 */
const NON_DEADLINE_CUES = [
  /\b(?:result|results)\b/i,
  /\bannounce(?:d|ment)?\b/i,
  /\binterview\b/i,
  /\borientation\b/i,
  /\benrol(?:l)?ment\b/i,
  /\bsemester\b/i,
  /\bacademic (?:year|calendar)\b/i,
  /\bnotification\b/i,
  /\bcommenc(?:e|ing|ement)\b/i,
  /\bstarts? on\b/i,
  /\barrival\b/i,
];

/** Nearest cue of a set to a position, or null. */
function nearestCue(text: string, cues: RegExp[], at: number): { distance: number; match: string } | null {
  let best: { distance: number; match: string } | null = null;
  for (const cue of cues) {
    const re = new RegExp(cue.source, cue.flags.includes("g") ? cue.flags : `${cue.flags}g`);
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      const distance = end <= at ? at - end : start >= at ? start - at : 0;
      if (!best || distance < best.distance) best = { distance, match: m[0] };
    }
  }
  return best;
}

/** The sentence containing an offset, trimmed, for use as evidence. */
function sentenceAt(text: string, at: number): string {
  const start = Math.max(
    text.lastIndexOf(".", at) + 1,
    text.lastIndexOf("\n", at) + 1,
    0
  );
  let end = text.length;
  for (const stop of [".", "\n"]) {
    const i = text.indexOf(stop, at);
    if (i !== -1 && i < end) end = i;
  }
  return text.slice(start, Math.min(end + 1, text.length)).replace(/\s+/g, " ").trim();
}

/** How near a cue must sit to count as labelling the date. */
const CUE_DISTANCE = 60;

/**
 * A closed range: two complete dates joined by a range marker. The CLOSING
 * date is the second one -- that is the only reading a two-ended range
 * supports. An OPEN range ("from 1 March 2026") has no second date and is
 * therefore refused, because its end is genuinely unstated.
 */
/**
 * Labels that introduce an APPLICATION window. Used only to validate a closed
 * range -- never to date a lone value, since a period has two ends and a
 * single date beside this label does not say which one it is.
 */
const PERIOD_CUES = [
  /\bapplication period\b/i,
  /\bapplications? (?:are )?accepted\b/i,
  /\bapply(?:ing)? (?:between|from)\b/i,
  /\bsubmission period\b/i,
  /\breceiving period\b/i,
];

const RANGE_JOINERS = /\s*(?:~|-|–|—|to|through|until)\s*/i;

function findClosedRangeEnd(text: string, dates: FoundDate[]): FoundDate | null {
  for (let i = 0; i < dates.length - 1; i++) {
    const a = dates[i], b = dates[i + 1];
    const between = text.slice(a.at + a.raw.length, b.at);
    // The gap between the two dates must be a joiner and nothing else.
    if (between.length <= 12 && RANGE_JOINERS.test(between) && between.replace(RANGE_JOINERS, "").trim() === "") {
      return b;
    }
  }
  return null;
}

/**
 * Decides the scholarship's deadline from the page's own apply text.
 *
 * Order matters: the non-deadline check runs before the closing check, so a
 * result date next to the word "deadline" elsewhere in the paragraph cannot
 * sneak through.
 */
export function extractScholarshipDeadline(applyText: string): DeadlineExtraction {
  const text = (applyText ?? "").trim();
  if (!text) return EMPTY;

  // Non-date phrasings first -- they are decided by wording, not by any date.
  const saysNoSeparateApplication = /\bno separate (?:process|application)\b/i.test(text);
  const saysAutomatic = /\bautomatic(?:ally)?\b/i.test(text);
  const saysSameAsAdmission =
    /\bsame as (?:the )?admission\b/i.test(text) ||
    /\badmissions?\s+application\s+period\b/i.test(text);

  const dates = findCompleteDates(text);

  if (dates.length > 0) {
    // A closed range resolves to its end date; otherwise consider each date
    // on its own merits and take the best-evidenced one.
    const rangeEnd = findClosedRangeEnd(text, dates);
    const candidates = rangeEnd ? [rangeEnd] : dates;

    let best: { d: FoundDate; label: string; confidence: number } | null = null;
    let sawConflict = false;

    for (const d of candidates) {
      const closing = nearestCue(text, CLOSING_CUES, d.at);
      const nonDeadline = nearestCue(text, NON_DEADLINE_CUES, d.at);

      // A nearer non-deadline cue disqualifies the date entirely. For a range
      // this is measured from the range's START, because the label that names
      // the range ("Interview period: X ~ Y") sits before the first date.
      const cueAnchor = rangeEnd ? dates[0].at : d.at;
      const nonDeadlineAtAnchor = rangeEnd ? nearestCue(text, NON_DEADLINE_CUES, cueAnchor) : nonDeadline;
      const closingAtAnchor = rangeEnd ? nearestCue(text, CLOSING_CUES, cueAnchor) : closing;

      if (
        nonDeadlineAtAnchor &&
        (!closingAtAnchor || nonDeadlineAtAnchor.distance < closingAtAnchor.distance)
      ) {
        continue;
      }

      if (rangeEnd) {
        // A two-ended range needs no closing cue: its end IS the close, by
        // definition. It does still need to be a range of APPLYING -- an
        // "application period" label, or ordinary closing wording. This is
        // why "application period" is not in CLOSING_CUES itself: for a lone
        // date it is ambiguous (a period has two ends), but for a range that
        // ambiguity is exactly what the second date resolves.
        const periodLabel = nearestCue(text, PERIOD_CUES, cueAnchor);
        const usable =
          (periodLabel && periodLabel.distance <= CUE_DISTANCE) ||
          (closingAtAnchor && closingAtAnchor.distance <= CUE_DISTANCE);
        if (!usable) continue;
        const label = periodLabel?.match ?? closingAtAnchor!.match;
        if (!best) best = { d, label, confidence: 0.9 };
        continue;
      }

      if (!closing || closing.distance > CUE_DISTANCE) continue;
      const confidence = closing.distance <= 25 ? 0.98 : 0.9;
      if (best && best.d.date !== d.date) sawConflict = true;
      if (!best || confidence > best.confidence) best = { d, label: closing.match, confidence };
    }

    // Two differently-dated candidates both labelled as closing: the page is
    // saying two things and this module does not choose between them.
    if (best && !sawConflict) {
      return {
        deadline: best.d.date,
        deadlineType: "fixed",
        deadlineLabel: best.label,
        confidence: best.confidence,
        evidence: sentenceAt(text, best.d.at),
      };
    }
    if (sawConflict) {
      return { ...EMPTY, confidence: 0, evidence: sentenceAt(text, candidates[0].at) };
    }
  }

  // No usable fixed date. Fall back to the non-date phrasings, which are
  // themselves meaningful lifecycle information.
  if (saysSameAsAdmission) {
    return {
      deadline: null,
      deadlineType: "admission_schedule",
      deadlineLabel: null,
      confidence: 0.9,
      evidence: null,
    };
  }
  if (saysNoSeparateApplication || saysAutomatic) {
    return {
      deadline: null,
      deadlineType: "automatic",
      deadlineLabel: null,
      confidence: 0.9,
      evidence: null,
    };
  }
  return EMPTY;
}
