import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeQuestion } from "@/lib/gks/question";
import seed from "@/lib/gks/faq-seed.json";

/**
 * FAQ Trends data.
 *
 * Two sources, deliberately kept distinguishable:
 *
 *  - **Seed** -- questions mined from the community corpus. These are real
 *    questions applicants asked each other, but the corpus is a conversation
 *    export, not a Q&A archive: the whole corpus yields 26 topics whose
 *    frequencies top out at 4. Presenting "4" next to a live "18 asks this
 *    week" would invite a comparison the data cannot support, so seed entries
 *    carry a qualitative label ("Frequently asked" / "Popular") and no count.
 *
 *  - **Live** -- real KMate asks, counted from gks_question_asks over the
 *    selected window. These get genuine counts.
 *
 * A live question that normalises to the same text as a seed topic is merged
 * into it rather than listed twice, so the seed converts into a live entry as
 * KMate usage grows.
 */

export type Period = "week" | "month" | "all";
export type ProgramFilter = "all" | "UG" | "G";
export type TrackFilter = "all" | "embassy" | "university";

export interface FaqEntry {
  /** Stable key for React and for the saved-state lookup. */
  key: string;
  question: string;
  topic: string;
  program: "UG" | "G" | "mixed";
  /** Live asks inside the selected window. Zero for a seed-only entry. */
  asks: number;
  /** Set only for seed-only entries -- never shown next to a live count. */
  seedLabel: "Frequently asked" | "Popular" | null;
  /** Present once the question exists in KMate, which is what makes it savable. */
  questionId: string | null;
  saved: boolean;
}

export interface FaqTrends {
  entries: FaqEntry[];
  savedEntries: FaqEntry[];
  topics: { label: string; count: number }[];
  stats: {
    liveAsks: number;
    liveQuestions: number;
    savedByYou: number;
    answeredOfficially: number;
    seedTopics: number;
  };
}

interface SeedTopic {
  question: string;
  topic: string;
  program: string;
  asks: number;
}

const SEED = seed as { topics: SeedTopic[] };

// The corpus tops out at 4 asks, so "Popular" is the genuinely repeated tail
// and "Frequently asked" the head. Both are qualitative on purpose.
function seedLabel(asks: number): "Frequently asked" | "Popular" {
  return asks >= 3 ? "Frequently asked" : "Popular";
}

function periodStart(period: Period): string | null {
  if (period === "all") return null;
  const days = period === "week" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// Track is inferred from the question text: KMate does not tag questions by
// track, and guessing one onto every question would be inventing a field.
const TRACK_PATTERNS: Record<Exclude<TrackFilter, "all">, RegExp> = {
  embassy: /\bembassy\b/i,
  university: /\buniversity track\b|\buniversit/i,
};

export async function loadFaqTrends(
  admin: SupabaseClient,
  userId: string,
  filters: { period: Period; program: ProgramFilter; track: TrackFilter; search: string }
): Promise<FaqTrends> {
  const since = periodStart(filters.period);

  // --- live asks in the window ---------------------------------------------
  let askQuery = admin.from("gks_question_asks").select("question_id, asked_at");
  if (since) askQuery = askQuery.gte("asked_at", since);
  const { data: askRows } = await askQuery;

  const liveCounts = new Map<string, number>();
  for (const row of askRows ?? []) {
    liveCounts.set(row.question_id, (liveCounts.get(row.question_id) ?? 0) + 1);
  }

  const { data: questionRows } = await admin
    .from("gks_questions")
    .select("id, question, question_norm, program, ask_count, official_sources");

  const { data: savedRows } = await admin
    .from("gks_saved_questions")
    .select("question_id")
    .eq("user_id", userId);
  const savedIds = new Set((savedRows ?? []).map((r) => r.question_id));

  // --- merge -----------------------------------------------------------------
  const entries: FaqEntry[] = [];
  const liveNorms = new Set<string>();

  for (const q of questionRows ?? []) {
    const asks = liveCounts.get(q.id) ?? 0;
    // Outside the window a question has no trend to report, but it stays
    // listed if the user saved it -- that is their own shelf, not a trend.
    if (since && asks === 0 && !savedIds.has(q.id)) continue;
    liveNorms.add(q.question_norm);
    entries.push({
      key: `live:${q.id}`,
      question: q.question,
      topic: topicFor(q.question),
      program: (q.program as "UG" | "G") ?? "mixed",
      asks,
      seedLabel: null,
      questionId: q.id,
      saved: savedIds.has(q.id),
    });
  }

  for (const t of SEED.topics) {
    // Already asked on KMate -> the live entry above represents this topic.
    if (liveNorms.has(normalizeQuestion(t.question))) continue;
    entries.push({
      key: `seed:${t.question}`,
      question: t.question,
      topic: t.topic,
      program: (t.program as "UG" | "G" | "mixed") ?? "mixed",
      asks: 0,
      seedLabel: seedLabel(t.asks),
      questionId: null,
      saved: false,
    });
  }

  // --- filter ------------------------------------------------------------------
  const needle = filters.search.trim().toLowerCase();
  const filtered = entries.filter((e) => {
    // "mixed" seed topics are relevant to both programs, so a program filter
    // narrows rather than excludes them.
    if (filters.program !== "all" && e.program !== "mixed" && e.program !== filters.program) return false;
    if (filters.track !== "all" && !TRACK_PATTERNS[filters.track].test(e.question)) return false;
    if (needle && !e.question.toLowerCase().includes(needle) && !e.topic.toLowerCase().includes(needle)) return false;
    return true;
  });

  // Live asks rank first; seed order is the corpus frequency it came in with.
  filtered.sort((a, b) => b.asks - a.asks || a.question.localeCompare(b.question));

  const topicCounts = new Map<string, number>();
  for (const e of filtered) topicCounts.set(e.topic, (topicCounts.get(e.topic) ?? 0) + 1);

  const answeredOfficially = (questionRows ?? []).filter((q) => {
    const sources = q.official_sources;
    return Array.isArray(sources) && sources.length > 0 && (liveCounts.get(q.id) ?? 0) > 0;
  }).length;

  return {
    entries: filtered,
    savedEntries: entries.filter((e) => e.saved),
    topics: [...topicCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    stats: {
      liveAsks: [...liveCounts.values()].reduce((n, v) => n + v, 0),
      liveQuestions: liveCounts.size,
      savedByYou: savedIds.size,
      answeredOfficially,
      seedTopics: SEED.topics.length,
    },
  };
}

// Same taxonomy the seed builder uses, applied to live questions so both
// sources land in the same topic chips.
const TOPIC_RULES: [string, RegExp][] = [
  ["IELTS", /\bielts\b|\btoefl\b|english proficiency|medium of instruction|\bmoi\b/i],
  ["TOPIK", /\btopik\b|korean language (?:test|exam|level|program)/i],
  ["Apostille", /apostill|consular|legaliz|notari|attest|authenticat/i],
  ["Recommendation letters", /recommend|\blor\b|referee|recommender/i],
  ["GPA", /\bgpa\b|\bcgpa\b|percentage|grade convers|scholaro|grading system|\bmarks\b/i],
  ["Passport", /\bpassport\b/i],
  ["Embassy track", /embassy track|\bembassy\b|\bconsulate\b/i],
  ["University track", /university track|how many universit|which universit|choose.{0,20}universit|\bmajor\b/i],
  ["Eligibility", /eligib|age limit|\bcitizen|nationalit|\bdisqualif|study gap|\bgap year/i],
  ["Timeline", /deadline|last date|application period|when (?:does|do|is|will|can)|result|announce/i],
  ["Transcript", /transcript|marksheet|mark sheet|academic record/i],
  ["Application forms", /\bform\s*\d|personal statement|study plan|self.?introduc|\bessay\b|\bsop\b/i],
  ["Interview", /\binterview\b/i],
  ["Scholarship benefits", /stipend|allowance|tuition fee|monthly|airfare|settlement/i],
  ["Documents", /document|certificate|\bseal|\bstamp|translat|photocop|\bcopy\b|birth cert/i],
];

function topicFor(question: string): string {
  for (const [label, pattern] of TOPIC_RULES) {
    if (pattern.test(question)) return label;
  }
  return "General";
}
