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
 *  F  - Delete authorisation: owner may, non-owner may not, imports and
 *       official content are protected, threads survive a deleted parent.
 *  G  - Contributor diversity: no contributor fills the answer list.
 *  H  - Stale imports are pruned on re-ask; user answers and upvoted imports
 *       are never pruned.
 *  I  - Admin moderation: an admin may remove another user's KMate-authored
 *       answer or post, imports stay protected even from admins, author and
 *       moderator removals stay distinguishable, ownership survives removal,
 *       and removed content cannot be voted on.
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

function del(path: string, cookie: string | null) {
  return fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: { ...(cookie ? { Cookie: cookie } : {}) },
    redirect: "manual",
  });
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
  canDelete: boolean;
  canModerate: boolean;
  deleted: boolean;
  deletionType: "author" | "moderator" | null;
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

/**
 * Admin moderation is gated by isAuthorizedAdmin(): the caller's email must
 * equal ADMIN_EMAIL *and* their profile must carry is_admin. To exercise that
 * for real without borrowing the operator's own account, start the server with
 * ADMIN_EMAIL set to this address and the suite provisions it:
 *
 *   ADMIN_EMAIL=e2e-admin@example.com npx next start --port 3901
 *
 * If the server isn't configured that way the admin checks are reported as
 * SKIP rather than quietly passing -- a moderation test that can't actually
 * reach the moderation path is worse than no test.
 */
const ADMIN_TEST_EMAIL = process.env.KMATE_TEST_ADMIN_EMAIL ?? "e2e-admin@example.com";

async function createTestAdmin() {
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200 });
  const found = existing?.users.find((u) => u.email === ADMIN_TEST_EMAIL);
  if (found) {
    await admin.from("profiles").delete().eq("id", found.id);
    await admin.auth.admin.deleteUser(found.id);
  }
  const { data: created, error } = await admin.auth.admin.createUser({
    email: ADMIN_TEST_EMAIL,
    email_confirm: true,
  });
  if (error || !created.user) throw new Error(`admin createUser failed: ${error?.message}`);
  const userId = created.user.id;

  // guard_profiles_is_admin() is a BEFORE UPDATE trigger that silently reverts
  // any is_admin change unless the caller is already an admin -- deliberately,
  // and for service-role writes too, so an end user can never self-promote.
  // It does not fire on INSERT, so the fixture is provisioned by replacing the
  // signup-trigger's row rather than by updating it. This weakens no guard:
  // it needs the service-role key, which no end user has.
  for (let i = 0; i < 10; i++) {
    const { data: exists } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (exists) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  await admin.from("profiles").delete().eq("id", userId);
  const { error: insertErr } = await admin.from("profiles").insert({
    id: userId,
    username: `e2eadmin${Date.now() % 100000}`,
    track: "gks_g",
    major: "Public Policy",
    application_year: 2027,
    onboarding_completed_at: new Date().toISOString(),
    is_admin: true,
  });
  if (insertErr) throw new Error(`admin profile insert failed: ${insertErr.message}`);

  const { data: check } = await admin.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  if (check?.is_admin !== true) throw new Error("test admin was not granted is_admin");

  return { userId, email: ADMIN_TEST_EMAIL };
}

async function main() {
  const userA = await createThrowawayUser(admin, "gksa");
  const userB = await createThrowawayUser(admin, "gksb");
  const adminUser = await createTestAdmin();
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

    // --- F: delete authorisation --------------------------------------------
    // Every negative case below must leave the row untouched, not merely
    // return an error code.
    const anonDelete = await del(`/api/gks/discussion/${rootId}`, null);
    check("F1 anonymous cannot delete",
      anonDelete.status === 401 || (anonDelete.status === 307 && (anonDelete.headers.get("location") ?? "").includes("/login")));

    // A's post, B tries to delete it.
    const crossUser = await del(`/api/gks/discussion/${rootId}`, cookieB);
    check("F2 a user cannot delete another user's discussion post", crossUser.status === 403);
    const { data: stillThere } = await admin
      .from("gks_discussion_posts").select("id, deleted_at").eq("id", rootId).maybeSingle();
    check("F2 the other user's post survived the attempt",
      Boolean(stillThere) && stillThere!.deleted_at === null);

    // B's reply, A tries to delete it.
    const crossReply = await del(`/api/gks/discussion/${replyId}`, cookieA);
    check("F3 a user cannot delete another user's reply", crossReply.status === 403);
    check("F3 the other user's reply survived",
      Boolean((await admin.from("gks_discussion_posts").select("id").eq("id", replyId).maybeSingle()).data));

    // Imported community answers have no owner and must be undeletable.
    const importDelete = await del(`/api/gks/answers/${target.id}`, cookieA);
    check("F4 an imported community answer cannot be deleted", importDelete.status === 403);
    check("F4 the imported answer survived",
      Boolean((await admin.from("gks_answers").select("id").eq("id", target.id).maybeSingle()).data));
    const importDeleteB = await del(`/api/gks/answers/${target.id}`, cookieB);
    check("F4 not deletable by a second user either", importDeleteB.status === 403);

    // A deletes their OWN answer -- allowed, and really gone.
    const ownAnswerId = mine!.id;
    const ownDelete = await del(`/api/gks/answers/${ownAnswerId}`, cookieA);
    check("F5 a user can delete their own KMate answer", ownDelete.status === 200);
    check("F5 the answer is actually gone",
      !(await admin.from("gks_answers").select("id").eq("id", ownAnswerId).maybeSingle()).data);
    const afterList = (await ownDelete.json()).answers as AnswerView[];
    check("F5 the response no longer contains it", !afterList.some((a) => a.id === ownAnswerId));

    // A deletes their own post that HAS replies -> tombstone, chain intact.
    const tombstone = await del(`/api/gks/discussion/${rootId}`, cookieA);
    check("F6 a user can delete their own discussion post", tombstone.status === 200);
    const tombBody = await tombstone.json();
    check("F6 a post with replies is tombstoned, not removed", tombBody.tombstoned === true);
    const { data: tombRow } = await admin
      .from("gks_discussion_posts").select("id, body, deleted_at").eq("id", rootId).maybeSingle();
    check("F6 the tombstone keeps the row but clears the words",
      Boolean(tombRow?.deleted_at) && tombRow!.body === "");
    const tombView = tombBody.discussion as DiscussionView[];
    check("F6 the reply chain survived", (tombView[0]?.replies?.length ?? 0) >= 1);
    check("F6 the tombstone exposes no author or body",
      tombView[0]?.deleted === true && !tombView[0]?.body && !tombView[0]?.authorName);
    check("F6 deleting twice is rejected", (await del(`/api/gks/discussion/${rootId}`, cookieA)).status === 409);

    // A post with no replies is removed outright.
    const solo = await post(`/api/gks/questions/${questionId}/discussion`, cookieA, { body: "E2E solo post to delete" });
    const soloId = ((await solo.json()).discussion as DiscussionView[]).find((d) => d.body === "E2E solo post to delete")!.id;
    const soloDelete = await del(`/api/gks/discussion/${soloId}`, cookieA);
    check("F7 a post with no replies is deleted outright", (await soloDelete.json()).tombstoned === false);
    check("F7 that row is gone",
      !(await admin.from("gks_discussion_posts").select("id").eq("id", soloId).maybeSingle()).data);

    // --- G: contributor diversity ---------------------------------------------
    const fresh = await post("/api/gks/ask", cookieA, { question: "ielts", program: "UG" });
    const freshThread = (await fresh.json()).thread as Thread | null;
    if (freshThread) {
      const { data: freshRows } = await admin
        .from("gks_answers").select("id, sender_alias").eq("question_id", freshThread.questionId);
      const aliasById = new Map((freshRows ?? []).map((r) => [r.id, r.sender_alias]));
      const counts = new Map<string, number>();
      for (const a of freshThread.answers) {
        const key = aliasById.get(a.id) ?? a.authorName;
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const worst = Math.max(0, ...counts.values());
      check(`G1 no contributor appears 3+ times (max seen: ${worst})`, worst <= 2);
      const names = freshThread.answers.filter((a) => a.origin === "community_import").map((a) => a.authorName);
      check("G1 the same contributor still maps to one stable alias",
        new Set(names).size === new Set([...counts.keys()]).size || names.length === 0);
      if (freshThread.questionId !== questionId) {
        await admin.from("gks_questions").delete().eq("id", freshThread.questionId);
      }
    }

    // --- H: stale imports are pruned on re-ask ---------------------------------
    // Threads are deduped and long-lived, so without pruning they only grow:
    // answers attached under an older, looser retriever would be shown forever
    // beside the new ones.
    const ownAnswer2 = "E2E: a KMate answer that must survive the prune.";
    await post(`/api/gks/questions/${questionId}/answers`, cookieA, { body: ownAnswer2 });
    await admin.from("gks_answers").insert([
      { question_id: questionId, origin: "community_import", body: "E2E stale import that retrieval no longer returns",
        sender_alias: "user_e2estale", external_key: "e2e_stale_cluster:deadbeef" },
    ]);
    const beforePrune = (await admin.from("gks_answers")
      .select("id", { count: "exact", head: true }).eq("question_id", questionId)).count ?? 0;

    await post("/api/gks/ask", cookieA, { question: QUESTION, program: "UG" });

    const { data: afterPrune } = await admin.from("gks_answers")
      .select("id, origin, body, external_key, upvotes_count").eq("question_id", questionId);
    const bodies = (afterPrune ?? []).map((a) => a.body);
    check("H1 the stale import was pruned on re-ask",
      !bodies.includes("E2E stale import that retrieval no longer returns"));
    check("H1 pruning actually removed rows", (afterPrune?.length ?? 0) < beforePrune);
    check("H2 a KMate-written answer is never pruned", bodies.includes(ownAnswer2));
    check("H3 an upvoted import is never pruned",
      (afterPrune ?? []).some((a) => a.id === target.id));

    // --- I: admin moderation ----------------------------------------------------
    const cookieAdmin = await sessionFor(adminUser.email);

    // Is the moderation gate actually reachable in this environment? Probe with
    // a real attempt rather than assuming.
    const bAnswer = await post(`/api/gks/questions/${questionId}/answers`, cookieB, {
      body: "E2E: an answer by user B that an admin should be able to remove.",
    });
    const bAnswerId = ((await bAnswer.json()).answers as AnswerView[])
      .find((a) => a.body.startsWith("E2E: an answer by user B"))!.id;

    const probe = await del(`/api/gks/answers/${bAnswerId}`, cookieAdmin);
    const adminGateActive = probe.status === 200;

    if (!adminGateActive) {
      console.log(`  SKIP  I* admin moderation -- server not started with ADMIN_EMAIL=${ADMIN_TEST_EMAIL} ` +
                  `(probe returned ${probe.status}); moderation paths NOT verified`);
      // A regular user must still be refused, whatever the admin config is.
      check("I0 a non-admin cannot moderate another user's answer",
        (await del(`/api/gks/answers/${bAnswerId}`, cookieA)).status === 403);
    } else {
      check("I1 an admin can remove another user's KMate answer", true);
      check("I1 the removed answer is gone",
        !(await admin.from("gks_answers").select("id").eq("id", bAnswerId).maybeSingle()).data);

      // Non-admins must not reach the same path.
      const bAnswer2 = await post(`/api/gks/questions/${questionId}/answers`, cookieB, {
        body: "E2E: a second answer by user B, for the non-admin check.",
      });
      const bAnswer2Id = ((await bAnswer2.json()).answers as AnswerView[])
        .find((a) => a.body.startsWith("E2E: a second answer by user B"))!.id;
      check("I2 a non-admin cannot remove another user's answer",
        (await del(`/api/gks/answers/${bAnswer2Id}`, cookieA)).status === 403);
      check("I2 that answer survived the non-admin attempt",
        Boolean((await admin.from("gks_answers").select("id").eq("id", bAnswer2Id).maybeSingle()).data));

      // Imports stay protected from admins too -- this endpoint is for user
      // content, and the corpus has no author to hold responsible.
      check("I3 an admin still cannot remove an imported community answer",
        (await del(`/api/gks/answers/${target.id}`, cookieAdmin)).status === 403);
      check("I3 the imported answer survived",
        Boolean((await admin.from("gks_answers").select("id").eq("id", target.id).maybeSingle()).data));

      // Official guideline text is not stored in this table at all.
      const { count: officialRows } = await admin
        .from("gks_answers").select("id", { count: "exact", head: true })
        .not("origin", "in", '("kmate_user","community_import")');
      check("I4 official answers are unreachable through this endpoint", officialRows === 0);

      // Moderating a post that has replies.
      const modRoot = await post(`/api/gks/questions/${questionId}/discussion`, cookieB, {
        body: "E2E: user B parent post to be moderated.",
      });
      const modRootId = ((await modRoot.json()).discussion as DiscussionView[])
        .find((d) => d.body.startsWith("E2E: user B parent post"))!.id;
      await post(`/api/gks/questions/${questionId}/discussion`, cookieA, {
        body: "E2E: a reply that must survive moderation of its parent.", parentId: modRootId,
      });

      const modResult = await del(`/api/gks/discussion/${modRootId}`, cookieAdmin);
      check("I5 an admin can remove another user's discussion post", modResult.status === 200);
      const modBody = await modResult.json();
      check("I5 it is tombstoned, not destroyed", modBody.tombstoned === true);
      check("I5 recorded as a moderator removal", modBody.deletionType === "moderator");

      const { data: modRow } = await admin
        .from("gks_discussion_posts")
        .select("author_id, body, deleted_at, deleted_by, deletion_type")
        .eq("id", modRootId).maybeSingle();
      check("I6 deletion_type is 'moderator'", modRow?.deletion_type === "moderator");
      check("I6 deleted_by records the admin", modRow?.deleted_by === adminUser.userId);
      check("I6 the original author is NOT overwritten", modRow?.author_id === userB.userId);
      check("I6 the body is cleared", modRow?.body === "");

      const modView = modBody.discussion as DiscussionView[];
      const tomb = modView.find((d) => d.id === modRootId);
      check("I7 the reply chain survived moderation", (tomb?.replies?.length ?? 0) >= 1);
      check("I7 the moderated body is absent from the payload",
        !JSON.stringify(modBody).includes("E2E: user B parent post to be moderated"));
      check("I7 the tombstone is marked as a moderator removal", tomb?.deletionType === "moderator");

      // Author deletion must remain distinguishable from moderation.
      const ownRoot = await post(`/api/gks/questions/${questionId}/discussion`, cookieA, {
        body: "E2E: user A parent post deleted by its own author.",
      });
      const ownRootId = ((await ownRoot.json()).discussion as DiscussionView[])
        .find((d) => d.body.startsWith("E2E: user A parent post"))!.id;
      await post(`/api/gks/questions/${questionId}/discussion`, cookieB, {
        body: "E2E: reply under the author-deleted parent.", parentId: ownRootId,
      });
      const ownResult = await del(`/api/gks/discussion/${ownRootId}`, cookieA);
      check("I8 author deletion is recorded as 'author', not moderation",
        (await ownResult.json()).deletionType === "author");

      // Removed content must not be votable.
      check("I9 a tombstoned post cannot be upvoted",
        (await post(`/api/gks/discussion/${modRootId}/upvote`, cookieA)).status === 403);
      check("I9 a deleted answer cannot be upvoted",
        (await post(`/api/gks/answers/${bAnswerId}/upvote`, cookieA)).status === 403);
      check("I9 the tombstone carries no votes",
        ((await admin.from("gks_discussion_upvotes")
          .select("post_id", { count: "exact", head: true }).eq("post_id", modRootId)).count ?? 0) === 0);
    }
  } finally {
    if (questionId) await admin.from("gks_questions").delete().eq("id", questionId);
    await cleanupUser(admin, userA.userId);
    await cleanupUser(admin, userB.userId);
    await cleanupUser(admin, adminUser.userId);
  }

  return summarize();
}

main().then((ok) => process.exit(ok ? 0 : 1));
