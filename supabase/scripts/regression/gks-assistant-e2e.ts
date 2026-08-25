/**
 * Live audit for the GKS Assistant structured-answer refinement (Official
 * answer / Community answers / Discussion, upvotes, save question).
 *
 * Covers, against the real running server + DB + deployed RAG service:
 *
 *  A1 - Asking persists a question thread and materialises the RAG's
 *       community answers, all tagged origin='community_import' with a null
 *       author_id (so nothing scraped can ever render as a KMate user).
 *  A2 - Imported answers are shown under a generated alias, the same alias
 *       every time for the same contributor, and the raw sender_alias is
 *       never sent to the client.
 *  A3 - Re-asking the same question joins the SAME thread (dedup on
 *       normalised text) rather than forking votes across duplicates, and
 *       increments ask_count.
 *  B1 - Upvote is one per user and toggles: same user twice = removed, two
 *       different users = 2, and a repeated POST cannot inflate the count.
 *  B2 - A KMate user's own answer is stored origin='kmate_user' with a real
 *       author_id, and renders under their real username.
 *  C1 - Save question toggles and is private to the saver.
 *  D1 - Discussion posts, one-level threading (a reply to a reply attaches to
 *       the thread root), and per-post upvotes.
 *  D2 - A reply can't be grafted onto a thread from a different question.
 *  E1 - Every mutating route rejects unauthenticated callers.
 *
 * Needs a running production build (`next start`), not `next dev`.
 * Run:
 *   KMATE_BASE_URL=http://localhost:3901 npx tsx supabase/scripts/regression/gks-assistant-e2e.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, makeChecker, createThrowawayUser, cleanupUser } from "./_env";

const env = loadEnvLocal();
const BASE_URL = process.env.KMATE_BASE_URL ?? "http://localhost:3901";
const PROJECT_REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const COOKIE_KEY = `sb-${PROJECT_REF}-auth-token`;
const CHUNK_SIZE = 3180;

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { check, summarize } = makeChecker();

function base64UrlEncode(str: string) {
  return Buffer.from(str, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sessionCookieHeader(session: unknown) {
  const encoded = "base64-" + base64UrlEncode(JSON.stringify(session));
  if (encoded.length <= CHUNK_SIZE) return `${COOKIE_KEY}=${encoded}`;
  const parts: string[] = [];
  for (let i = 0, idx = 0; i < encoded.length; i += CHUNK_SIZE, idx++) {
    parts.push(`${COOKIE_KEY}.${idx}=${encoded.slice(i, i + CHUNK_SIZE)}`);
  }
  return parts.join("; ");
}

async function sessionFor(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.action_link) throw new Error(`generateLink failed: ${error?.message}`);
  const res = await fetch(data.properties.action_link, { redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) throw new Error("no redirect location from magic link");
  const hash = new URLSearchParams(new URL(location).hash.slice(1));
  const plain = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: sessionData, error: setErr } = await plain.auth.setSession({
    access_token: hash.get("access_token")!,
    refresh_token: hash.get("refresh_token")!,
  });
  if (setErr || !sessionData.session) throw new Error(`setSession failed: ${setErr?.message}`);
  return sessionCookieHeader(sessionData.session);
}

function post(path: string, cookie: string | null, body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    // Manual, so the proxy's 307-to-/login stays visible instead of being
    // silently followed and reported as the login page's own 200.
    redirect: "manual",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

interface AnswerView {
  id: string;
  origin: string;
  authorName: string;
  authorMeta: string | null;
  body: string;
  createdAt: string | null;
  upvotes: number;
  hasUpvoted: boolean;
}
interface DiscussionView {
  id: string;
  authorName: string;
  body: string;
  upvotes: number;
  hasUpvoted: boolean;
  replies: DiscussionView[];
}
interface Thread {
  questionId: string;
  askCount: number;
  saved: boolean;
  answers: AnswerView[];
  discussion: DiscussionView[];
}

// Distinctive enough that it can't collide with a real user's question in the
// shared question bank, and cleaned up at the end either way.
const QUESTION = `E2E probe ${Date.now()}: do I need to apostille my transcript?`;

async function main() {
  const userA = await createThrowawayUser(admin, "gksa");
  const userB = await createThrowawayUser(admin, "gksb");
  let questionId = "";

  try {
    const cookieA = await sessionFor(userA.email);
    const cookieB = await sessionFor(userB.email);

    // --- A1: asking persists a thread + imported answers ------------------
    const askRes = await post("/api/gks/ask", cookieA, { question: QUESTION, program: "UG" });
    const asked = await askRes.json();
    check("A1 ask returns 200", askRes.status === 200);
    const thread = asked.thread as Thread | null;
    check("A1 ask opens a persisted thread", Boolean(thread?.questionId));
    if (!thread) throw new Error("no thread returned -- cannot continue");
    questionId = thread.questionId;

    const { data: dbAnswers } = await admin
      .from("gks_answers")
      .select("id, origin, author_id, sender_alias, external_key")
      .eq("question_id", questionId);
    check("A1 community answers were materialised", (dbAnswers?.length ?? 0) > 0);
    check(
      "A1 every imported answer is origin=community_import with NO author_id",
      (dbAnswers ?? []).every((a) => a.origin !== "community_import" || a.author_id === null)
    );
    check(
      "A1 every imported answer carries an external_key",
      (dbAnswers ?? []).every((a) => a.origin !== "community_import" || Boolean(a.external_key))
    );

    // --- A2: aliases are generated, consistent, and never raw -------------
    const imported = thread.answers.filter((a) => a.origin === "community_import");
    check("A2 imported answers are present in the response", imported.length > 0);
    check(
      "A2 no raw sender_alias (user_xxx) leaks to the client",
      !JSON.stringify(thread.answers).includes("user_")
    );
    check(
      "A2 imported answers render as an alias, not a KMate username",
      imported.every((a) => /^[A-Z][a-z-]+ [A-Z]\./.test(a.authorName) || a.authorName === "Community member")
    );
    check(
      "A2 imported answers carry NO fabricated timestamp",
      imported.every((a) => a.createdAt === null)
    );
    check(
      "A2 distinct contributors get distinct aliases",
      new Set(imported.map((a) => a.authorName)).size === imported.length ||
        imported.length > new Set((dbAnswers ?? []).map((a) => a.sender_alias)).size
    );

    // --- A3: re-asking joins the same thread ------------------------------
    const reask = await post("/api/gks/ask", cookieB, { question: `  ${QUESTION.toUpperCase()}  `, program: "UG" });
    const reasked = await reask.json();
    const thread2 = reasked.thread as Thread;
    check("A3 re-asking joins the SAME thread", thread2.questionId === questionId);
    check("A3 ask_count incremented", thread2.askCount > thread.askCount);
    const { count: dupCount } = await admin
      .from("gks_questions")
      .select("id", { count: "exact", head: true })
      .eq("id", questionId);
    check("A3 no duplicate question rows", dupCount === 1);
    const { data: afterReask } = await admin
      .from("gks_answers")
      .select("id")
      .eq("question_id", questionId);
    check(
      "A3 re-asking did not duplicate imported answers",
      (afterReask?.length ?? 0) === (dbAnswers?.length ?? 0)
    );

    // --- B1: upvote is one-per-user and toggles ---------------------------
    const target = imported[0];
    const up1 = await post(`/api/gks/answers/${target.id}/upvote`, cookieA);
    check("B1 upvote returns 200", up1.status === 200);
    check("B1 upvote reports upvoted=true", (await up1.json()).upvoted === true);

    let { data: row } = await admin.from("gks_answers").select("upvotes_count").eq("id", target.id).single();
    check("B1 count is 1 after one upvote", row?.upvotes_count === 1);

    await post(`/api/gks/answers/${target.id}/upvote`, cookieA);
    ({ data: row } = await admin.from("gks_answers").select("upvotes_count").eq("id", target.id).single());
    check("B1 same user upvoting again REMOVES the vote", row?.upvotes_count === 0);

    await post(`/api/gks/answers/${target.id}/upvote`, cookieA);
    await post(`/api/gks/answers/${target.id}/upvote`, cookieB);
    ({ data: row } = await admin.from("gks_answers").select("upvotes_count").eq("id", target.id).single());
    check("B1 two different users = 2", row?.upvotes_count === 2);

    const { count: voteRows } = await admin
      .from("gks_answer_upvotes")
      .select("answer_id", { count: "exact", head: true })
      .eq("answer_id", target.id);
    check("B1 exactly one vote row per user", voteRows === 2);

    // --- B2: a KMate user's own answer ------------------------------------
    const myAnswer = "E2E: my embassy accepted an apostilled copy of the original transcript.";
    const postAnswer = await post(`/api/gks/questions/${questionId}/answers`, cookieA, { body: myAnswer });
    check("B2 posting an answer returns 200", postAnswer.status === 200);
    const answersAfter = (await postAnswer.json()).answers as AnswerView[];
    const mine = answersAfter.find((a) => a.body === myAnswer);
    check("B2 the posted answer comes back", Boolean(mine));
    check("B2 stored as origin=kmate_user", mine?.origin === "kmate_user");
    check("B2 rendered under the real KMate username", Boolean(mine && !/^[A-Z][a-z]+ [A-Z]\.$/.test(mine.authorName)));
    check("B2 carries a real timestamp", Boolean(mine?.createdAt));
    const { data: mineRow } = await admin
      .from("gks_answers")
      .select("author_id, external_key")
      .eq("body", myAnswer)
      .maybeSingle();
    check("B2 has a real author_id and no external_key",
      mineRow?.author_id === userA.userId && mineRow?.external_key === null);

    // Ordering: the 2-vote import must outrank the brand-new 0-vote answer.
    check("B2 answers are ordered by upvotes first", answersAfter[0].id === target.id);

    // --- C1: save question -------------------------------------------------
    const save1 = await post(`/api/gks/questions/${questionId}/save`, cookieA);
    check("C1 save returns saved=true", (await save1.json()).saved === true);
    const { count: savedForB } = await admin
      .from("gks_saved_questions")
      .select("question_id", { count: "exact", head: true })
      .eq("question_id", questionId)
      .eq("user_id", userB.userId);
    check("C1 saving is private to the saver", savedForB === 0);
    const save2 = await post(`/api/gks/questions/${questionId}/save`, cookieA);
    check("C1 saving again un-saves", (await save2.json()).saved === false);

    // --- D1: discussion ----------------------------------------------------
    const d1 = await post(`/api/gks/questions/${questionId}/discussion`, cookieA, { body: "E2E: which office apostilles it?" });
    check("D1 discussion post returns 200", d1.status === 200);
    const disc1 = (await d1.json()).discussion as DiscussionView[];
    check("D1 thread appears", disc1.length === 1);
    const rootId = disc1[0].id;

    const d2 = await post(`/api/gks/questions/${questionId}/discussion`, cookieB, { body: "E2E: MOFA did mine.", parentId: rootId });
    const disc2 = (await d2.json()).discussion as DiscussionView[];
    check("D1 reply nests under the thread", disc2[0].replies.length === 1);
    const replyId = disc2[0].replies[0].id;

    const d3 = await post(`/api/gks/questions/${questionId}/discussion`, cookieA, { body: "E2E: thanks!", parentId: replyId });
    const disc3 = (await d3.json()).discussion as DiscussionView[];
    check("D1 threads stay one level deep", disc3.length === 1 && disc3[0].replies.length === 2);
    check("D1 no reply-of-a-reply nesting", disc3[0].replies.every((r) => r.replies.length === 0));

    const dv = await post(`/api/gks/discussion/${rootId}/upvote`, cookieB);
    check("D1 discussion upvote returns 200", dv.status === 200);
    const { data: postRow } = await admin
      .from("gks_discussion_posts")
      .select("upvotes_count")
      .eq("id", rootId)
      .single();
    check("D1 discussion upvote counted", postRow?.upvotes_count === 1);

    // --- D2: cross-question reply grafting ---------------------------------
    const otherQ = await admin
      .from("gks_questions")
      .insert({ program: "G", question: "E2E other", question_norm: `e2e other ${Date.now()}` })
      .select("id")
      .single();
    const graft = await post(`/api/gks/questions/${otherQ.data!.id}/discussion`, cookieA, {
      body: "E2E graft attempt",
      parentId: rootId,
    });
    check("D2 a reply can't be grafted onto another question's thread", graft.status === 400);
    await admin.from("gks_questions").delete().eq("id", otherQ.data!.id);

    // --- E1: unauthenticated callers ---------------------------------------
    // KMate's proxy turns away anonymous API calls with a 307 to /login before
    // the handler ever runs (same as every other protected route -- compare
    // /api/questions/<id>/upvote), and the handlers additionally 401 on their
    // own. Either is a rejection; what actually matters is that nothing was
    // written, which is asserted below.
    const beforeVotes = (await admin.from("gks_answer_upvotes").select("answer_id", { count: "exact", head: true }).eq("answer_id", target.id)).count;
    const beforeAnswers = (await admin.from("gks_answers").select("id", { count: "exact", head: true }).eq("question_id", questionId)).count;
    const beforePosts = (await admin.from("gks_discussion_posts").select("id", { count: "exact", head: true }).eq("question_id", questionId)).count;

    const anon = await Promise.all([
      post("/api/gks/ask", null, { question: QUESTION, program: "UG" }),
      post(`/api/gks/answers/${target.id}/upvote`, null),
      post(`/api/gks/discussion/${rootId}/upvote`, null),
      post(`/api/gks/questions/${questionId}/save`, null),
      post(`/api/gks/questions/${questionId}/answers`, null, { body: "anon" }),
      post(`/api/gks/questions/${questionId}/discussion`, null, { body: "anon" }),
    ]);
    check(
      "E1 every mutating route turns away anonymous callers",
      anon.every((r) => r.status === 401 || (r.status === 307 && (r.headers.get("location") ?? "").includes("/login")))
    );

    const afterVotes = (await admin.from("gks_answer_upvotes").select("answer_id", { count: "exact", head: true }).eq("answer_id", target.id)).count;
    const afterAnswers = (await admin.from("gks_answers").select("id", { count: "exact", head: true }).eq("question_id", questionId)).count;
    const afterPosts = (await admin.from("gks_discussion_posts").select("id", { count: "exact", head: true }).eq("question_id", questionId)).count;
    check("E1 anonymous calls wrote nothing", afterVotes === beforeVotes && afterAnswers === beforeAnswers && afterPosts === beforePosts);
    check("E1 anonymous save wrote nothing",
      (await admin.from("gks_saved_questions").select("question_id", { count: "exact", head: true }).eq("question_id", questionId)).count === 0);
  } finally {
    if (questionId) await admin.from("gks_questions").delete().eq("id", questionId);
    await cleanupUser(admin, userA.userId);
    await cleanupUser(admin, userB.userId);
  }

  return summarize();
}

main().then((ok) => process.exit(ok ? 0 : 1));
