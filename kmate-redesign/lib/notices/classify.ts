import type { QueueProgram, QueueTrack, QueueNoticeType } from "./review-schema";

/**
 * Classification of an official notice into program / track / type.
 *
 * This is deliberately a keyword matcher over the notice's own words, not a
 * model and not a heuristic that fills gaps. The rule it follows everywhere:
 * a signal must be PRESENT in the official text to be recorded. Absence
 * yields "unknown" or null, never a plausible default.
 *
 * The asymmetry to note: an ambiguous result (both programs named, both
 * tracks named) also collapses to unknown/null. A notice that mentions both
 * is not evidence for either one, so recording one of them would be an
 * invention.
 */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

/**
 * Korean is a first-class input here, not an afterthought.
 *
 * The board publishes most notices in Korean with a bracketed English title,
 * and a good number of GKS notices carry no English at all. English-only
 * patterns would classify those as unknown/null -- safe, but useless. So each
 * signal below is listed in both languages.
 *
 * 한국정부초청장학생/장학사업 is the official Korean name of the Global Korea
 * Scholarship; 학부 is undergraduate, 대학원/석사/박사 graduate-level.
 */

/**
 * Undergraduate signals. "GKS-U" and the spelled-out program name, plus the
 * older "KGSP-U" branding the board still uses in places.
 */
const UNDERGRAD = [
  /\bgks[-\s]?u\b/,
  /\bkgsp[-\s]?u\b/,
  /global korea scholarship[^.]{0,40}\bundergraduate\b/,
  /\bundergraduate (degree )?(program|programme|course)\b/,
  /\bassociate degree\b/,
  /\bbachelor'?s? (degree|program)\b/,
  // Korean
  /한국정부초청.{0,6}(학부|전문학사)/,
  /학부.{0,4}(과정|유학생|장학생)/,
  /전문학사/,
];

/** Graduate signals, including the master's/doctoral/research wording. */
const GRAD = [
  /\bgks[-\s]?g\b/,
  /\bkgsp[-\s]?g\b/,
  /global korea scholarship[^.]{0,40}\bgraduate\b/,
  /\bgraduate (degree )?(program|programme|course)\b/,
  /\bmaster'?s? (degree|program)\b/,
  /\bdoctoral (degree|program)\b/,
  /\bph\.?\s?d\.?\b/,
  /\bresearch program\b/,
  // Korean
  /한국정부초청.{0,6}(대학원|석사|박사)/,
  /대학원.{0,4}(과정|유학생|장학생)/,
  /(석사|박사).{0,4}(과정|학위)/,
];

const EMBASSY = [
  /\bembassy track\b/,
  /\bembassy[-\s]recommend/,
  /\bthrough (the )?embassy\b/,
  /\bkorean embassy\b/,
  // Korean
  /대사관.{0,3}추천/,
  /재외공관.{0,3}추천/,
];
const UNIVERSITY_TRACK = [
  /\buniversity track\b/,
  /\buniversity[-\s]recommend/,
  /\bthrough (the )?university\b/,
  // Korean
  /대학.{0,3}추천/,
];

const any = (patterns: RegExp[], text: string) => patterns.some((p) => p.test(text));

/**
 * GKS-U / GKS-G / unknown.
 *
 * Naming both programs returns "unknown" on purpose: a combined announcement
 * genuinely belongs to neither exclusively, and the reviewer decides.
 */
export function classifyProgram(text: string): QueueProgram {
  const t = norm(text);
  const u = any(UNDERGRAD, t);
  const g = any(GRAD, t);
  if (u && !g) return "GKS-U";
  if (g && !u) return "GKS-G";
  return "unknown";
}

/**
 * embassy / university / null.
 *
 * null is the honest answer both when no track is named and when both are --
 * in neither case has the notice told us which track it governs.
 */
export function classifyTrack(text: string): QueueTrack {
  const t = norm(text);
  const e = any(EMBASSY, t);
  const u = any(UNIVERSITY_TRACK, t);
  if (e && !u) return "embassy";
  if (u && !e) return "university";
  return null;
}

/**
 * Notice type. Ordered most-specific first, because a results announcement
 * routinely also contains the word "schedule" and a guideline routinely
 * contains the word "deadline"; checking in specificity order stops the
 * generic word from winning.
 *
 * "other" is a real outcome, not a fallback bucket for failure -- plenty of
 * official notices are neither of the four.
 */
const TYPE_RULES: { type: QueueNoticeType; patterns: RegExp[] }[] = [
  {
    type: "result",
    patterns: [
      /\b(successful|selected) (candidates?|applicants?)\b/,
      /\bresults? (of|for|announcement)\b/,
      /\bannouncement of (the )?results?\b/,
      /\bnotification of (the )?results?\b/,
      /\b(announcement|list) of .{0,30}\b(successful|selected|passed)\b/,
      /\b(first|second|third|1st|2nd|3rd|final) round .{0,20}result/,
      /\bsuccessfully passed\b/,
      // Korean: 합격자 발표 / 선발 결과 / 최종 합격
      /합격자.{0,4}발표/,
      /(선발|심사).{0,4}결과/,
      /(최종|1차|2차|3차).{0,4}합격/,
    ],
  },
  {
    type: "schedule_change",
    patterns: [
      /\b(postpone|postponed|postponement)\b/,
      /\b(delay|delayed|deferred)\b/,
      /\b(reschedul|re-schedul)/,
      /\b(revised|amended|corrected|updated) (schedule|timeline|notice|announcement)\b/,
      /\bchange of (schedule|date|deadline)\b/,
      /\bextension of .{0,25}(deadline|period)\b/,
      /\bdeadline (has been )?extended\b/,
      // Korean: 일정 변경 / 연기 / 기간 연장 / 정정
      /(일정|날짜|기간).{0,4}(변경|연기|조정)/,
      /(연기|순연)\s*(안내|공고)/,
      /기간.{0,4}연장/,
      /(정정|수정|변경).{0,4}(공고|안내|알림)/,
    ],
  },
  {
    type: "guideline",
    patterns: [
      /\bapplication guidelines?\b/,
      /\bprogram guidelines?\b/,
      /\bguidelines? for\b/,
      /\bcall for applications?\b/,
      /\b(announcement|notice) of .{0,30}\brecruitment\b/,
      /\bhow to apply\b/,
      // Korean: 선발요강 / 모집요강 / 시행계획 / 모집 공고
      /(선발|모집).{0,2}요강/,
      /시행\s*계획/,
      /(모집|선발).{0,4}공고/,
    ],
  },
  {
    type: "deadline",
    patterns: [
      /\bapplication (period|deadline)\b/,
      /\bsubmission deadline\b/,
      /\bdeadline for\b/,
      /\bclosing date\b/,
      /\bdue (date|by)\b/,
      // Korean: 접수 마감 / 신청 기한 / 제출 마감
      /(접수|신청|제출).{0,4}(마감|기한)/,
      /마감\s*(일|일자|안내)/,
    ],
  },
];

export function classifyNoticeType(text: string): QueueNoticeType {
  const t = norm(text);
  for (const rule of TYPE_RULES) if (any(rule.patterns, t)) return rule.type;
  return "other";
}

export interface Classification {
  program: QueueProgram;
  track: QueueTrack;
  notice_type: QueueNoticeType;
}

/**
 * Classifies from title + body. The title is weighted by being scanned
 * first on its own: a GKS-U notice whose body happens to cite the graduate
 * programme in passing should still classify from what it calls itself.
 * Only when the title is silent does the body get consulted.
 */
export function classifyNotice(title: string, body: string): Classification {
  const combined = `${title}\n${body}`;
  const titleProgram = classifyProgram(title);
  const titleTrack = classifyTrack(title);
  const titleType = classifyNoticeType(title);

  return {
    program: titleProgram !== "unknown" ? titleProgram : classifyProgram(combined),
    track: titleTrack !== null ? titleTrack : classifyTrack(combined),
    notice_type: titleType !== "other" ? titleType : classifyNoticeType(combined),
  };
}
