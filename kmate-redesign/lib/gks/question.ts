import "server-only";
import { createHash } from "node:crypto";

/**
 * Dedup key for a question.
 *
 * Two applicants typing "Do I need IELTS for GKS-U?" and "do i need ielts for
 * gks u" are asking one question, and should land on one thread so the
 * discussion and upvotes accumulate rather than scattering across a dozen
 * near-identical copies. This is intentionally shallow -- case, punctuation
 * and spacing only. It does not stem, drop stopwords, or try to equate
 * differently-worded questions: collapsing two genuinely different questions
 * into one thread is far worse than leaving two similar threads apart, since
 * the first silently shows people answers to something they didn't ask.
 */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .normalize("NFKD")
    // Keep letters/digits from any script (Hangul, Devanagari, Cyrillic...),
    // drop everything else -- punctuation, emoji, stray quotes.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 500);
}

/**
 * Stable identity of one imported community answer within a question.
 *
 * The RAG service is stateless and re-retrieves on every ask, so the same
 * answer has to resolve to the same row each time or its upvotes would reset
 * on every re-ask. Derived from the cluster it belongs to plus a digest of
 * the answer text itself: if the corpus is re-ingested and the text changes,
 * that is a different answer and deserves a different row rather than
 * inheriting votes cast on wording nobody can see any more.
 */
export function communityAnswerKey(clusterId: string, text: string): string {
  const digest = createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);
  return `${clusterId}:${digest}`;
}
