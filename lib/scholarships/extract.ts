import "server-only";
import { htmlToCleanText } from "@/lib/notices/study-in-korea";

/**
 * Phase 2 scholarship extraction.
 *
 * Design rule, enforced throughout: an adapter's only job is to COPY text out
 * of a known markup structure into labelled buckets. It never decides what a
 * value means. The mapping from those verbatim buckets to typed columns
 * (mapSections below) is a small set of literal, auditable rules -- an
 * explicit date, an explicit GPA figure, an explicit "no separate
 * application" sentence. Anything the page doesn't state stays null; nothing
 * is filled in from context or from what other universities typically offer.
 *
 * Adapters are per-source on purpose. A generic "guess the scholarship
 * fields from arbitrary prose" extractor is exactly the thing that would
 * fabricate, so each registered page's real structure is encoded explicitly.
 */

export interface RawScholarship {
  /** Verbatim scholarship name as printed on the page. */
  name: string;
  /** Group heading the page itself prints above this scholarship, if any. */
  groupLabel: string | null;
  /** label -> verbatim lines, exactly as listed under that label. */
  sections: Record<string, string[]>;
}

export interface MappedScholarship extends RawScholarship {
  benefitType: string | null;
  tuitionCoverage: string | null;
  gpaRequirement: string | null;
  topikRequirement: string | null;
  applicationRequired: boolean | null;
  automaticConsideration: boolean | null;
  deadline: string | null;
  deadlineType: "fixed" | "admission_schedule" | "automatic" | null;
}

const stripTags = (s: string) => htmlToCleanText(s);

/** Splits a <ul>/<ol> into its <li> texts, dropping empties. */
function listItems(html: string): string[] {
  return [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => stripTags(m[1]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/**
 * KAIST (admission.kaist.ac.kr). One scholarship per page; the body is a
 * flat sequence of `<h3><b>Label</b></h3>` headings each followed by a
 * `<ul class="txt_list">`. The scholarship's own name is the last breadcrumb
 * entry, which the page renders as a non-linking `<a href="javascript:;">`.
 */
export function parseKaistScholarshipPage(html: string, fallbackName: string): RawScholarship[] {
  const body = html.match(/<div\b[^>]*class="[^"]*board_wrap[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<footer)/i);
  const region = body?.[1] ?? html;

  const sections: Record<string, string[]> = {};
  const headingRe = /<h3\b[^>]*>\s*(?:<b>)?([\s\S]*?)(?:<\/b>)?\s*<\/h3>([\s\S]*?)(?=<h3\b|$)/gi;
  for (const m of region.matchAll(headingRe)) {
    const label = stripTags(m[1]).replace(/\s+/g, " ").trim();
    const items = listItems(m[2]);
    if (label && items.length) sections[label] = items;
  }
  if (Object.keys(sections).length === 0) return [];

  // Breadcrumb tail = the page's own title for this scholarship.
  const crumbs = [...html.matchAll(/<a\b[^>]*href="javascript:;"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => stripTags(m[1]).replace(/\s+/g, " ").trim())
    .filter((t) => /scholarship/i.test(t));
  const name = crumbs.length ? crumbs[crumbs.length - 1] : fallbackName;

  if (Object.keys(sections).length === 0) return [];
  return [{ name, groupLabel: null, sections }];
}

/**
 * KAIST's graduate pages are authored as free prose rather than the
 * undergraduate site's heading/list template, but still carry an explicit,
 * machine-readable label form: each `<li>` opens with a bold span ending in a
 * colon ("Benefits:", "Eligibility Requirements:") followed by its value.
 * Only that exact shape is read -- a `<li>` without a bold "Label:" prefix is
 * skipped rather than guessed at.
 */
export function parseKaistProseScholarshipPage(html: string, fallbackName: string): RawScholarship[] {
  const body = html.match(/<div\b[^>]*class="[^"]*board_wrap[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<footer)/i);
  const region = body?.[1] ?? html;

  const sections: Record<string, string[]> = {};
  let sawRepeatedLabel = false;
  for (const li of region.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const inner = li[1];
    const bold = inner.match(/<(?:span|strong|b)\b[^>]*(?:font-weight:\s*bold|<\/?(?:strong|b)\b)[^>]*>([\s\S]*?)<\/(?:span|strong|b)>/i)
      ?? inner.match(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/i);
    if (!bold) continue;
    const label = stripTags(bold[1]).replace(/\s+/g, " ").trim().replace(/:$/, "");
    if (!label) continue;
    if (label in sections) sawRepeatedLabel = true;
    const value = stripTags(inner.replace(bold[0], "")).replace(/\s+/g, " ").replace(/^[:\s]+/, "").trim();
    if (value) sections[label] = [value];
  }

  // A repeated label means the page describes SEVERAL programmes in one
  // block-per-programme layout (KAIST's graduate page lists KAIST
  // Scholarship / KGPS / KPS this way). Those blocks carry no per-programme
  // name element, so merging them would attach one programme's benefits to
  // another's name -- every string verbatim, but the association invented.
  // Refuse to extract rather than misattribute; the source is reported as
  // blocked instead.
  if (sawRepeatedLabel) return [];

  if (Object.keys(sections).length === 0) return [];

  const crumbs = [...html.matchAll(/<a\b[^>]*href="javascript:;"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => stripTags(m[1]).replace(/\s+/g, " ").trim())
    .filter((t) => /scholarship/i.test(t));
  return [{ name: crumbs.length ? crumbs[crumbs.length - 1] : fallbackName, groupLabel: null, sections }];
}

/**
 * Korea University (oia.korea.ac.kr). Multiple scholarships per page, each an
 * accordion: `a.accd_head > span` carries the name, a `dl.scholarship_list`
 * carries `<dt>` label / `<dd>` value pairs, and an optional
 * `.note_box .note_desc` carries the footnote. Accordions are grouped under
 * `p.cont_tit` headings ("Newly Admitted Students", etc.) which the page
 * states explicitly and which become scholarship_type.
 */
export function parseKoreaUniversityScholarshipPage(html: string): RawScholarship[] {
  const out: RawScholarship[] = [];

  // Walk group headings and accordions in document order so each scholarship
  // is attributed to the heading actually printed above it.
  const tokenRe = /<p\b[^>]*class="[^"]*cont_tit[^"]*"[^>]*>([\s\S]*?)<\/p>|<div\b[^>]*class="[^"]*accd_wrap[^"]*"[^>]*>([\s\S]*?)(?=<div\b[^>]*class="[^"]*(?:accd_wrap|cont_box)|<\/div>\s*<\/div>\s*<\/div>)/gi;

  let currentGroup: string | null = null;
  for (const m of html.matchAll(tokenRe)) {
    if (m[1] !== undefined) {
      currentGroup = stripTags(m[1]).replace(/\s+/g, " ").trim() || null;
      continue;
    }
    const block = m[2] ?? "";
    const nameMatch = block.match(/<a\b[^>]*class="[^"]*accd_head[^"]*"[^>]*>\s*<span>([\s\S]*?)<\/span>/i);
    const name = nameMatch ? stripTags(nameMatch[1]).replace(/\s+/g, " ").trim() : "";
    if (!name) continue;

    const sections: Record<string, string[]> = {};
    const dlRe = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi;
    for (const d of block.matchAll(dlRe)) {
      const label = stripTags(d[1]).replace(/\s+/g, " ").trim();
      const value = stripTags(d[2])
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (label && value.length) sections[label] = value;
    }
    const note = block.match(/<p\b[^>]*class="[^"]*note_desc[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    if (note) {
      const text = stripTags(note[1]).replace(/\s+/g, " ").trim();
      if (text) sections["Note(s)"] = [text];
    }

    if (Object.keys(sections).length) out.push({ name, groupLabel: currentGroup, sections });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Verbatim buckets -> typed columns (literal rules only)
// ---------------------------------------------------------------------------

const BENEFIT_LABELS = /^(subsidies|benefits?)$/i;
const APPLY_LABELS = /^(application period|how to apply)$/i;
const REQUIREMENT_LABELS = /^(requirements?|note\(s\)|evaluation criteria|eligibility)$/i;

function findSection(sections: Record<string, string[]>, re: RegExp): string[] {
  for (const [label, lines] of Object.entries(sections)) if (re.test(label.trim())) return lines;
  return [];
}

/**
 * Explicit calendar dates only: "2026-09-30", "September 30, 2026",
 * "30 September 2026". A bare month, a season, or "the admission period" is
 * NOT a date and returns null rather than being resolved into one.
 */
export function findExplicitDate(text: string): string | null {
  const MONTHS: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };
  const iso = text.match(/\b(20\d{2})[-.\/](0?[1-9]|1[0-2])[-.\/](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const mdy = text.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2})\b/);
  if (mdy && MONTHS[mdy[1].toLowerCase()]) {
    return `${mdy[3]}-${String(MONTHS[mdy[1].toLowerCase()]).padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  }
  const dmy = text.match(/\b(\d{1,2})\s+([A-Za-z]+),?\s+(20\d{2})\b/);
  if (dmy && MONTHS[dmy[2].toLowerCase()]) {
    return `${dmy[3]}-${String(MONTHS[dmy[2].toLowerCase()]).padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return null;
}

/** Returns the whole verbatim line containing an explicit GPA figure. */
function findGpaLine(lines: string[]): string | null {
  return lines.find((l) => /\bGPA\b[^.]*?\d(\.\d+)?/i.test(l)) ?? null;
}

/** Returns the whole verbatim line mentioning TOPIK. */
function findTopikLine(lines: string[]): string | null {
  return lines.find((l) => /\bTOPIK\b/i.test(l)) ?? null;
}

/**
 * Maps verbatim sections onto typed columns using only literal signals.
 * Every rule here is a direct reading of a sentence the page prints; none
 * of them consult context, the university's reputation, or peer norms.
 */
export function mapSections(raw: RawScholarship): MappedScholarship {
  const benefitLines = findSection(raw.sections, BENEFIT_LABELS);
  const applyLines = findSection(raw.sections, APPLY_LABELS);
  const requirementLines = [
    ...findSection(raw.sections, REQUIREMENT_LABELS),
    ...Object.entries(raw.sections)
      .filter(([l]) => REQUIREMENT_LABELS.test(l.trim()))
      .flatMap(([, v]) => v),
  ];
  const allLines = Object.values(raw.sections).flat();
  const applyText = applyLines.join(" ");

  // A date is only a deadline if it appears in the section about applying.
  const explicitDate = applyText ? findExplicitDate(applyText) : null;

  // Literal phrasings only. "no separate process/application" and "same as
  // admission" are printed verbatim by both registered sources.
  // Scoped to the section about applying only. Reading "automatically" out
  // of, say, a benefits footnote and calling the whole award automatic would
  // be inference, not transcription.
  const saysNoSeparateApplication = /\bno separate (?:process|application)\b/i.test(applyText);
  const saysSameAsAdmission = /\bsame as (?:the )?admission\b/i.test(applyText);
  const saysAutomatic = /\bautomatic(?:ally)?\b/i.test(applyText);

  let deadlineType: MappedScholarship["deadlineType"] = null;
  if (explicitDate) deadlineType = "fixed";
  else if (saysSameAsAdmission) deadlineType = "admission_schedule";
  else if (saysNoSeparateApplication || saysAutomatic) deadlineType = "automatic";

  const gpaLine = findGpaLine([...requirementLines, ...allLines]);
  const topikLine = findTopikLine([...requirementLines, ...allLines]);
  const tuitionLines = benefitLines.filter((l) => /tuition/i.test(l));

  return {
    ...raw,
    benefitType: benefitLines.length ? benefitLines.join("\n") : null,
    tuitionCoverage: tuitionLines.length ? tuitionLines.join("\n") : null,
    gpaRequirement: gpaLine,
    topikRequirement: topikLine,
    // Only assert these when the page says so outright; otherwise null
    // rather than a default of false.
    applicationRequired: saysNoSeparateApplication ? false : null,
    automaticConsideration: saysAutomatic || saysNoSeparateApplication ? true : null,
    // The DB additionally enforces deadline-only-when-fixed.
    deadline: deadlineType === "fixed" ? explicitDate : null,
    deadlineType,
  };
}
