import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeQuestion, communityAnswerKey } from "@/lib/gks/question";
import { communityAliases } from "@/lib/gks/alias";

export type Program = "UG" | "G";
export type AnswerOrigin = "kmate_user" | "community_import";

/** One community answer as the UI should render it -- identity already resolved. */
export interface AnswerView {
  id: string;
  origin: AnswerOrigin;
  /** A real KMate username, or a generated alias. Which one is decided by `origin`. */
  authorName: string;
  /** "GKS-U · Chemistry · 2027" -- only ever built from a real profile. */
  authorMeta: string | null;
  body: string;
  /**
   * Null for imports. The corpus carries no trustworthy per-message time (the
   * export timestamps are stripped by the sanitizer), and the row's own
   * created_at is when KMate first materialised it, not when the person wrote
   * it -- rendering that as "2d ago" would be a fabricated fact.
   */
  createdAt: string | null;
  upvotes: number;
  hasUpvoted: boolean;
  /** True when the signed-in user may delete this (their own KMate answer). */
  canDelete: boolean;
  /**
   * True when the viewer is an admin acting on someone else's KMate answer.
   * Never set for imports -- moderation covers user-written content only.
   */
  canModerate: boolean;
  /**
   * Further answers by this same contributor, held back so one person can't
   * fill the section. Zero for everyone except the contributor's top answer.
   */
  moreFromContributor: number;
}

export interface DiscussionView {
  id: string;
  authorName: string;
  authorMeta: string | null;
  body: string;
  createdAt: string;
  upvotes: number;
  hasUpvoted: boolean;
  replies: DiscussionView[];
  /** True when the signed-in user is this post's author. */
  canDelete: boolean;
  /** True when the viewer is an admin acting on someone else's post. */
  canModerate: boolean;
  /** Tombstone: removed, but replies below it survive. */
  deleted: boolean;
  /** Who removed it -- drives the tombstone wording. Null when not deleted. */
  deletionType: "author" | "moderator" | null;
}

/** The shape the RAG service returns for one community cluster. */
interface RagCommunityCase {
  cluster_id: string;
  answers: { text: string; sender_alias?: string | null }[];
}

interface ProfileRow {
  id: string;
  username: string | null;
  track: string | null;
  major: string | null;
  application_year: number | null;
}

const TRACK_LABELS: Record<string, string> = { gks_u: "GKS-U", gks_g: "GKS-G" };

function profileMeta(profile: ProfileRow | undefined): string | null {
  if (!profile) return null;
  const parts = [
    profile.track ? TRACK_LABELS[profile.track] : null,
    profile.major,
    profile.application_year ? String(profile.application_year) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Finds or creates the thread for a question.
 *
 * Deduped on (program, normalised text) so re-asking joins the existing
 * thread and its accumulated votes and discussion. The official snapshot is
 * only written on first creation: overwriting it on every ask would silently
 * rewrite what earlier readers were shown.
 */
export async function upsertQuestion(
  admin: SupabaseClient,
  input: {
    program: Program;
    question: string;
    userId: string;
    officialAnswer: string | null;
    officialSources: unknown[];
  }
): Promise<{ id: string; askCount: number }> {
  const questionNorm = normalizeQuestion(input.question);

  const existing = await admin
    .from("gks_questions")
    .select("id, ask_count")
    .eq("program", input.program)
    .eq("question_norm", questionNorm)
    .maybeSingle();

  if (existing.data) {
    const askCount = (existing.data.ask_count ?? 1) + 1;
    await admin
      .from("gks_questions")
      .update({ ask_count: askCount, last_asked_at: new Date().toISOString() })
      .eq("id", existing.data.id);
    return { id: existing.data.id, askCount };
  }

  const inserted = await admin
    .from("gks_questions")
    .insert({
      program: input.program,
      question: input.question,
      question_norm: questionNorm,
      asked_by: input.userId,
      official_answer: input.officialAnswer,
      official_sources: input.officialSources,
    })
    .select("id, ask_count")
    .maybeSingle();

  if (inserted.data) return { id: inserted.data.id, askCount: inserted.data.ask_count ?? 1 };

  // Lost a race with a concurrent ask of the same question -- the unique index
  // did its job, so just join the thread the other request created.
  const raced = await admin
    .from("gks_questions")
    .select("id, ask_count")
    .eq("program", input.program)
    .eq("question_norm", questionNorm)
    .maybeSingle();
  if (!raced.data) throw new Error("could not create or find question thread");
  return { id: raced.data.id, askCount: raced.data.ask_count ?? 1 };
}

/**
 * Persists the imported answers the RAG returned for this question.
 *
 * Idempotent on (question, external_key), so re-asking re-attaches to the
 * existing rows and their votes rather than inserting duplicates. Returns the
 * RAG's ordering (which is its usefulness ranking) so the caller can use it
 * as the tiebreak when vote counts are equal.
 */
export async function syncCommunityAnswers(
  admin: SupabaseClient,
  questionId: string,
  cases: RagCommunityCase[]
): Promise<Map<string, number>> {
  const ragRank = new Map<string, number>();
  const rows: Record<string, unknown>[] = [];

  for (const c of cases) {
    for (const answer of c.answers ?? []) {
      const text = (answer.text ?? "").trim();
      if (!text) continue;
      const key = communityAnswerKey(c.cluster_id, text);
      if (ragRank.has(key)) continue; // same reply surfaced under two clusters
      ragRank.set(key, ragRank.size);
      rows.push({
        question_id: questionId,
        origin: "community_import",
        body: text,
        sender_alias: answer.sender_alias ?? null,
        external_key: key,
      });
    }
  }

  if (rows.length) {
    await admin.from("gks_answers").upsert(rows, {
      onConflict: "question_id,external_key",
      ignoreDuplicates: true,
    });
  }

  // Prune imports that retrieval no longer returns.
  //
  // Question threads are deduped and long-lived, so without this they only
  // ever grow: answers materialised under an older, looser retriever stay
  // attached forever and are shown next to the new ones. That is exactly how
  // asking "ietls" still surfaced apostille and marksheet replies after the
  // retriever itself had stopped returning them.
  //
  // Two things are deliberately never pruned: answers written by KMate users
  // (they are nobody's cache, and `origin` guards that), and imports somebody
  // has upvoted -- a vote is a person saying this helped them, which outranks
  // a retrieval score.
  const keptKeys = [...ragRank.keys()];
  let stale = admin
    .from("gks_answers")
    .delete()
    .eq("question_id", questionId)
    .eq("origin", "community_import")
    .eq("upvotes_count", 0);
  if (keptKeys.length) {
    stale = stale.not("external_key", "in", `(${keptKeys.map((k) => `"${k}"`).join(",")})`);
  }
  await stale;

  return ragRank;
}

/**
 * Loads every answer on a question with identity and vote state resolved.
 *
 * Ordering: upvotes first, because a vote is the clearest signal an applicant
 * found something useful. At equal votes, KMate answers come before imports
 * (newest first) -- someone who wrote an answer here is responding to *this*
 * question, whereas an import merely matched it -- and imports fall back to
 * the RAG's own usefulness ranking.
 */
export async function loadAnswers(
  admin: SupabaseClient,
  questionId: string,
  userId: string,
  ragRank?: Map<string, number>,
  /** Resolved server-side by isAuthorizedAdmin(); never taken from the client. */
  isAdmin = false
): Promise<AnswerView[]> {
  const { data: rows } = await admin
    .from("gks_answers")
    .select("id, origin, author_id, sender_alias, body, external_key, upvotes_count, created_at")
    .eq("question_id", questionId);

  if (!rows?.length) return [];

  const { data: myVotes } = await admin
    .from("gks_answer_upvotes")
    .select("answer_id")
    .eq("user_id", userId)
    .in("answer_id", rows.map((r) => r.id));
  const voted = new Set((myVotes ?? []).map((v) => v.answer_id));

  const profiles = await loadProfiles(admin, rows.map((r) => r.author_id));

  // Aliases are assigned over the whole set at once so two different
  // contributors can never collide onto the same display name in one thread.
  const senders = rows
    .filter((r) => r.origin === "community_import" && r.sender_alias)
    .map((r) => r.sender_alias as string);
  const aliases = communityAliases(senders);

  const views: AnswerView[] = rows.map((r) => {
    const profile = r.author_id ? profiles.get(r.author_id) : undefined;
    const isImport = r.origin === "community_import";
    return {
      id: r.id,
      origin: r.origin as AnswerOrigin,
      authorName: isImport
        ? (r.sender_alias ? aliases.get(r.sender_alias) ?? "Community member" : "Community member")
        : profile?.username ?? "KMate member",
      authorMeta: isImport ? null : profileMeta(profile),
      body: r.body,
      createdAt: isImport ? null : r.created_at,
      upvotes: r.upvotes_count ?? 0,
      hasUpvoted: voted.has(r.id),
      // Imports have no owner to delete them, and official text isn't stored
      // here at all -- so only your own KMate answer is ever deletable.
      canDelete: !isImport && r.author_id === userId,
      // Moderation is for other people's user-written content: an admin
      // deleting their own answer is just deleting, and an import has no
      // author to moderate.
      canModerate: isAdmin && !isImport && r.author_id !== userId,
      moreFromContributor: 0,
    };
  });

  const rankOf = (r: (typeof rows)[number]) =>
    r.external_key ? ragRank?.get(r.external_key) ?? Number.MAX_SAFE_INTEGER : -1;
  const byId = new Map(rows.map((r) => [r.id, r]));

  const ranked = views.sort((a, b) => {
    if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
    if (a.origin !== b.origin) return a.origin === "kmate_user" ? -1 : 1;
    if (a.origin === "kmate_user") {
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    }
    return rankOf(byId.get(a.id)!) - rankOf(byId.get(b.id)!);
  });

  return diversify(ranked, rows);
}

/**
 * Stops one contributor filling the section.
 *
 * A prolific contributor legitimately answers many threads, so their replies
 * genuinely rank well and the section ends up showing the same generated name
 * three times -- which reads as one person talking to themselves. Every
 * contributor gets one slot in the first pass; their remaining answers are
 * appended only after every other voice has been heard, and never more than
 * one extra each, so no contributor can reach three in the initial view.
 *
 * Nothing is discarded or re-aliased: the held-back answers are counted on the
 * contributor's top answer as `moreFromContributor` for the UI to disclose,
 * and the same contributor keeps the same stable alias throughout.
 */
function diversify(
  ranked: AnswerView[],
  rows: { id: string; sender_alias: string | null; author_id: string | null }[]
): AnswerView[] {
  const keyById = new Map(
    rows.map((r) => [r.id, r.sender_alias ?? r.author_id ?? r.id])
  );

  const firstPass: AnswerView[] = [];
  const overflow: AnswerView[] = [];
  const seen = new Set<string>();
  const topAnswerFor = new Map<string, AnswerView>();

  for (const view of ranked) {
    const key = keyById.get(view.id)!;
    if (seen.has(key)) {
      overflow.push(view);
      continue;
    }
    seen.add(key);
    topAnswerFor.set(key, view);
    firstPass.push(view);
  }

  // Second pass: at most one extra per contributor, so the ceiling is two.
  const usedSecondSlot = new Set<string>();
  const secondPass: AnswerView[] = [];
  for (const view of overflow) {
    const key = keyById.get(view.id)!;
    if (usedSecondSlot.has(key)) {
      // Third and beyond: counted, not shown.
      const top = topAnswerFor.get(key);
      if (top) top.moreFromContributor += 1;
      continue;
    }
    usedSecondSlot.add(key);
    secondPass.push(view);
  }

  return [...firstPass, ...secondPass];
}

/** Discussion for a question, nested one level and ordered oldest-first. */
export async function loadDiscussion(
  admin: SupabaseClient,
  questionId: string,
  userId: string,
  /** Resolved server-side by isAuthorizedAdmin(); never taken from the client. */
  isAdmin = false
): Promise<DiscussionView[]> {
  const { data: rows } = await admin
    .from("gks_discussion_posts")
    .select("id, parent_id, author_id, body, upvotes_count, created_at, deleted_at, deletion_type")
    .eq("question_id", questionId)
    .order("created_at", { ascending: true });

  if (!rows?.length) return [];

  const { data: myVotes } = await admin
    .from("gks_discussion_upvotes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", rows.map((r) => r.id));
  const voted = new Set((myVotes ?? []).map((v) => v.post_id));

  const profiles = await loadProfiles(admin, rows.map((r) => r.author_id));

  const toView = (r: (typeof rows)[number]): DiscussionView => {
    const profile = r.author_id ? profiles.get(r.author_id) : undefined;
    const deleted = Boolean(r.deleted_at);
    return {
      id: r.id,
      // Discussion is KMate-only -- nothing is imported into it -- so a
      // missing profile means a deleted account, not an anonymous import.
      // A tombstone shows no author at all: the point of deleting is that
      // your words stop being attributed to you.
      authorName: deleted ? "" : profile?.username ?? "Former member",
      authorMeta: deleted ? null : profileMeta(profile),
      body: deleted ? "" : r.body,
      createdAt: r.created_at,
      upvotes: deleted ? 0 : r.upvotes_count ?? 0,
      hasUpvoted: !deleted && voted.has(r.id),
      replies: [],
      canDelete: !deleted && r.author_id === userId,
      canModerate: !deleted && isAdmin && r.author_id !== userId,
      deleted,
      deletionType: deleted ? ((r.deletion_type as "author" | "moderator" | null) ?? "author") : null,
    };
  };

  const roots: DiscussionView[] = [];
  const byId = new Map<string, DiscussionView>();
  for (const r of rows) {
    const view = toView(r);
    byId.set(r.id, view);
    if (!r.parent_id) roots.push(view);
  }
  for (const r of rows) {
    if (!r.parent_id) continue;
    // A reply whose parent is missing would otherwise vanish from the thread.
    (byId.get(r.parent_id)?.replies ?? roots).push(byId.get(r.id)!);
  }
  return roots;
}

export async function isQuestionSaved(
  admin: SupabaseClient,
  questionId: string,
  userId: string
): Promise<boolean> {
  const { data } = await admin
    .from("gks_saved_questions")
    .select("question_id")
    .eq("question_id", questionId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

async function loadProfiles(
  admin: SupabaseClient,
  ids: (string | null)[]
): Promise<Map<string, ProfileRow>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map();
  const { data } = await admin
    .from("profiles")
    .select("id, username, track, major, application_year")
    .in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p as ProfileRow]));
}
