import {
  GKS_U_2027_EVIDENCE,
  GKS_U_2027_SOURCE,
  type GksU2027GuidelineEvidence,
} from "@/lib/gks/guidelines-2027";
import { GKS_U_2027_PAGE_MAP } from "@/lib/gks/gks-u-2027-page-map";

const STOP = new Set([
  "the","a","an","and","or","but","to","of","for","in","on","at","by","with","from","as",
  "is","are","was","were","be","been","being","do","does","did","can","could","should","would",
  "will","may","might","must","i","me","my","we","our","you","your","it","this","that","these",
  "those","what","when","where","which","who","how","why","please","tell","about","need","needed",
]);

export interface RetrievedGksU2027Evidence {
  layer: "official";
  score: number;
  program: "UG";
  category: GksU2027GuidelineEvidence["topic"];
  claim: string;
  source_title: string;
  source_url: string;
  cycle: string;
  page: number;
  content_type: "prose";
  extraction_quality: "clean" | "needs_review";
}

const TOPIC_LABELS: Record<string, string> = {
  eligibility: "eligibility rules",
  grades: "grade / CGPA rules",
  deadline: "application deadlines",
  university_choice: "university-choice rules",
  documents: "document submission rules",
  apostille: "apostille / consular-confirmation rules",
  language: "language-test rules",
  evaluation: "evaluation and bonus-point rules",
  fallback: "Embassy-to-University fallback rules",
  passport: "passport rules",
  recommendation: "recommendation-letter rules",
  graduation: "graduation requirements",
  benefits: "scholarship benefits",
};

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9%.-]+/g) ?? []).filter(
    (t) => t.length > 1 && !STOP.has(t)
  );
}

function scoreEvidence(question: string, item: GksU2027GuidelineEvidence): number {
  const q = question.toLowerCase();
  const qt = new Set(tokens(question));
  const claimTokens = new Set(tokens(item.claim));

  let score = 0;
  for (const t of qt) {
    if (claimTokens.has(t)) score += 1;
  }

  for (const keyword of item.keywords) {
    const k = keyword.toLowerCase();
    if (q.includes(k)) score += k.includes(" ") ? 4 : 2;
  }

  if (q.includes(item.topic.replace("_", " "))) score += 2;

  // Topic intent matters more than generic phrase overlap. Without this,
  // questions such as "Do I need apostille in the Embassy first round?"
  // could rank unrelated first-round fallback rules just because they also
  // contain "Embassy Track first round".
  const topicIntent: Partial<Record<GksU2027GuidelineEvidence["topic"], string[]>> = {
    apostille: ["apostille", "apostilled", "consular", "authentication", "notary", "notarized"],
    documents: ["document", "documents", "scan", "scanned", "original", "upload", "submit"],
    fallback: ["fail", "failed", "fallback", "backup", "pass first round", "passed first round"],
    deadline: ["deadline", "date", "when", "application window"],
    grades: ["grade", "gpa", "cgpa", "percentage", "marks", "rank"],
    language: ["topik", "ielts", "toefl", "language score"],
    university_choice: ["type a", "type b", "university choice", "universities", "department"],
    passport: ["passport"],
    recommendation: ["recommendation", "recommender"],
    graduation: ["graduate", "graduation", "expected graduate"],
    eligibility: ["eligible", "eligibility", "citizenship", "nationality", "age"],
    evaluation: ["evaluation", "bonus", "additional points", "score advantage"],
    benefits: ["benefit", "benefits", "allowance", "stipend", "tuition", "airfare", "flight", "scholarship period"],
  };

  const intentTerms = topicIntent[item.topic] ?? [];
  if (intentTerms.some((term) => q.includes(term))) score += 8;

  if (
    item.topic === "fallback" &&
    !["fail", "failed", "fallback", "backup", "pass first round", "passed first round"].some((term) =>
      q.includes(term)
    )
  ) {
    score -= 8;
  }

  if (
    item.topic === "apostille" &&
    q.includes("first round") &&
    (q.includes("apostille") || q.includes("consular"))
  ) {
    score += 10;
  }

  return score;
}

function scorePageMap(question: string, entry: (typeof GKS_U_2027_PAGE_MAP)[number]): number {
  const q = question.toLowerCase();
  const qt = new Set(tokens(question));
  const summaryTokens = new Set(tokens(entry.summary));
  let score = 0;

  for (const token of qt) {
    if (summaryTokens.has(token)) score += 1;
  }
  for (const keyword of entry.keywords) {
    const k = keyword.toLowerCase();
    if (q.includes(k)) score += k.includes(" ") ? 4 : 2;
  }
  return score;
}

export function retrieveGksU2027(question: string, limit = 6): RetrievedGksU2027Evidence[] {
  const structured = GKS_U_2027_EVIDENCE
    .map((item) => ({ item, score: scoreEvidence(question, item) }))
    .filter((x) => x.score > 1)
    .sort((a, b) => b.score - a.score || a.item.page - b.item.page);

  const results: RetrievedGksU2027Evidence[] = structured.slice(0, limit).map(({ item, score }) => ({
    layer: "official" as const,
    score: Number((Math.min(score / 12, 1)).toFixed(4)),
    program: "UG" as const,
    category: item.topic,
    claim: item.claim,
    source_title: GKS_U_2027_SOURCE.title,
    source_url: GKS_U_2027_SOURCE.sourceUrl,
    cycle: GKS_U_2027_SOURCE.cycle,
    page: item.page,
    content_type: "prose" as const,
    extraction_quality: "clean" as const,
  }));

  // Broad-recall fallback across all 45 pages. These page summaries locate
  // relevant guideline sections when an atomic fact has not yet been curated.
  // They are deliberately lower-confidence than the reviewed structured rules
  // because the official English attachment was revised on 0914 after the
  // baseline used to build this page map.
  if (results.length < limit) {
    const usedPages = new Set(results.map((item) => item.page));
    const pageFallbacks = GKS_U_2027_PAGE_MAP
      .map((entry) => ({ entry, score: scorePageMap(question, entry) }))
      .filter((x) => x.score > 1 && !usedPages.has(x.entry.page))
      .sort((a, b) => b.score - a.score || a.entry.page - b.entry.page)
      .slice(0, limit - results.length)
      .map(({ entry, score }) => ({
        layer: "official" as const,
        score: Number((Math.min(score / 20, 0.55)).toFixed(4)),
        program: "UG" as const,
        category: entry.topics[0] ?? "documents",
        claim: entry.summary,
        source_title: GKS_U_2027_SOURCE.title,
        source_url: GKS_U_2027_SOURCE.sourceUrl,
        cycle: GKS_U_2027_SOURCE.cycle,
        page: entry.page,
        content_type: "prose" as const,
        extraction_quality: "needs_review" as const,
      }));
    results.push(...pageFallbacks);
  }

  return results;
}

export function guidelineCoverage(question: string, official: ReturnType<typeof retrieveGksU2027>) {
  const q = question.toLowerCase();
  const asked = new Set<string>();

  const topicTerms: Record<string, string[]> = {
    eligibility: ["eligible", "eligibility", "citizenship", "nationality", "age", "parent"],
    grades: ["grade", "gpa", "cgpa", "percentage", "rank", "marks"],
    deadline: ["deadline", "date", "when", "submission", "apply"],
    university_choice: ["university", "universities", "choice", "type a", "type b", "department", "major"],
    documents: ["document", "documents", "scan", "original", "upload", "submit"],
    apostille: ["apostille", "apostilled", "consular", "notary", "notarized", "authentication"],
    language: ["topik", "ielts", "toefl", "language", "english", "korean"],
    evaluation: ["evaluation", "score", "points", "bonus", "advantage"],
    fallback: ["fail", "failed", "fallback", "university track", "backup"],
    passport: ["passport"],
    recommendation: ["recommendation", "recommender", "teacher", "principal"],
    graduation: ["graduate", "graduation", "expected graduation", "diploma"],
    benefits: ["benefit", "benefits", "allowance", "stipend", "tuition", "airfare", "flight", "scholarship period"],
  };

  for (const [topic, terms] of Object.entries(topicTerms)) {
    if (terms.some((term) => q.includes(term))) asked.add(topic);
  }

  const covered = new Set(official.map((item) => item.category).filter(Boolean) as string[]);
  const unsupported = [...asked].filter((topic) => !covered.has(topic));

  return {
    question_concepts: [...asked],
    covered: [...asked].filter((topic) => covered.has(topic)),
    unsupported,
    unsupported_labels: unsupported.map((topic) => TOPIC_LABELS[topic] ?? topic.replaceAll("_", " ")),
  };
}
