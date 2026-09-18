import "server-only";
import { htmlToCleanText } from "@/lib/notices/study-in-korea";
import { extractScholarshipDeadline } from "./deadline-extract";

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
  /**
   * Set only by adapters whose source states a per-scholarship degree level
   * (SNU tags each entry in its own taxonomy). Left undefined when the level
   * comes from the registered source config instead.
   */
  degreeLevel?: "undergraduate" | "graduate" | null;
  /** Set when each scholarship has its own page, so the row links to that page. */
  sourceUrl?: string;
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

/**
 * SNU Office of Global Affairs (oga.snu.ac.kr). One scholarship per page,
 * built in Elementor: each section is a heading widget carrying the
 * site-specific `scholarship-tit` class, followed by the widgets holding
 * that section's content until the next such heading.
 *
 * Because it's one scholarship per page, the ambiguous-boundary problem that
 * forced a refusal on KAIST's graduate page cannot arise here -- there is
 * never more than one programme competing for the same section labels.
 *
 * Tables inside a section (SPF's tuition/stipend grid, GT's award tiers)
 * flatten to their text content. That is still a verbatim transcription of
 * what the page shows, just without the grid layout.
 */
export function parseSnuOgaScholarshipPage(
  html: string,
  name: string,
  groupLabel: string | null,
  degreeLevel: "undergraduate" | "graduate" | null,
  sourceUrl: string
): RawScholarship[] {
  const headingRe = /scholarship-tit[^>]*>\s*<div class="elementor-widget-container">\s*<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g;

  const marks: { label: string; start: number }[] = [];
  for (const m of html.matchAll(headingRe)) {
    const label = stripTags(m[1]).replace(/\s+/g, " ").trim();
    if (label && label !== "&nbsp;") marks.push({ label, start: m.index! + m[0].length });
  }
  if (marks.length === 0) return [];

  const sections: Record<string, string[]> = {};
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? html.lastIndexOf("scholarship-tit", marks[i + 1].start) : html.length;
    const chunk = html.slice(marks[i].start, end > marks[i].start ? end : html.length);
    const lines = stripTags(chunk)
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (lines.length) sections[marks[i].label] = lines;
  }
  if (Object.keys(sections).length === 0) return [];

  return [{ name, groupLabel, sections, degreeLevel, sourceUrl }];
}

/** Scholarship entries on the OGA listing page, with the taxonomy the site tags each with. */
export interface SnuListingEntry {
  name: string;
  url: string;
  categories: string[];
}

/**
 * Parses the OGA scholarship index. Each entry is a WordPress custom-post
 * `scholarship` article whose class list carries the site's own taxonomy
 * (scholarship_cate-graduate-students, -undergraduate-students,
 * -snu-scholarships, -external-scholarships, -exchange-program).
 */
export function parseSnuOgaListing(html: string): SnuListingEntry[] {
  const out: SnuListingEntry[] = [];
  const seen = new Set<string>();
  const re = /<article[^>]*class="([^"]*\bscholarship\b[^"]*)"[\s\S]*?<h4[^>]*><a href="([^"]+)">([\s\S]*?)<\/a><\/h4>/g;
  for (const m of html.matchAll(re)) {
    const [, cls, url, rawName] = m;
    const name = stripTags(rawName).replace(/\s+/g, " ").trim();
    if (!name || seen.has(url)) continue;
    seen.add(url);
    out.push({ name, url, categories: [...cls.matchAll(/scholarship_cate-([a-z0-9-]+)/g)].map((c) => c[1]) });
  }
  return out;
}

/**
 * Degree level from SNU's own taxonomy tags. Deliberately returns null when
 * the site tags an entry as BOTH graduate and undergraduate (several
 * external scholarships are), or as neither (exchange-program): the column
 * holds a single value and inventing one would misstate the source.
 */
export function degreeLevelFromSnuCategories(categories: string[]): "undergraduate" | "graduate" | null {
  const grad = categories.includes("graduate-students");
  const under = categories.includes("undergraduate-students");
  if (grad && !under) return "graduate";
  if (under && !grad) return "undergraduate";
  return null;
}

/**
 * The two group headings the listing page itself prints above these entries
 * ("SNU Scholarships" / "External Scholarships"), keyed by the taxonomy slug
 * the same page attaches. Not a description invented here.
 */
export function groupLabelFromSnuCategories(categories: string[]): string | null {
  if (categories.includes("snu-scholarships")) return "SNU Scholarships";
  if (categories.includes("external-scholarships")) return "External Scholarships";
  if (categories.includes("exchange-program")) return "Exchange Program";
  return null;
}

// ---------------------------------------------------------------------------
// Verbatim buckets -> typed columns (literal rules only)
// ---------------------------------------------------------------------------

// Each alternative below is a heading string actually printed by one of the
// registered sources -- KAIST ("Subsidies"), Korea University ("Benefits"),
// SNU OGA ("Details of the Award" / "Details for Scholarship" /
// "Details of the GKS"). Nothing here is a guessed synonym.
const BENEFIT_LABELS = /^(subsidies|benefits?|details of the award|details for scholarship|details of the gks)$/i;
const APPLY_LABELS = /^(application period|how to apply|application)$/i;
const REQUIREMENT_LABELS = /^(requirements?|note\(s\)|notes|evaluation criteria|eligibility|priority)$/i;

function findSection(sections: Record<string, string[]>, re: RegExp): string[] {
  for (const [label, lines] of Object.entries(sections)) if (re.test(label.trim())) return lines;
  return [];
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

  // Several SNU pages put the application timing on an explicitly labelled
  // "Application Period : ..." LINE inside a wider section (e.g. "Details of
  // the Award") rather than under a heading of its own. Reading that line is
  // still transcription -- the page labels it -- so it counts as apply text
  // alongside any dedicated section.
  const labelledApplyLines = allLines.filter((l) => /^\s*application period\s*[:：]/i.test(l));
  const applyText = [...applyLines, ...labelledApplyLines].join(" ");

  // Deadline decisions moved to ./deadline-extract, which requires a COMPLETE
  // date labelled with explicit closing wording. The rule that used to live
  // here -- "the first date in the apply section is the deadline" -- would read
  // a result or interview date as an application deadline, and in practice
  // matched nothing at all, because these pages write month-only text such as
  // "Application Period : January".
  const extracted = extractScholarshipDeadline(applyText);
  const deadlineType = extracted.deadlineType;

  // Still read here for the two boolean columns below, which describe how the
  // award is GRANTED rather than when it closes.
  const saysNoSeparateApplication = /no separate (?:process|application)/i.test(applyText);
  const saysAutomatic = /automatic(?:ally)?/i.test(applyText);

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
    deadline: extracted.deadline,
    deadlineType,
  };
}
