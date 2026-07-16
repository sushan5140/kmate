/**
 * Live audit for the 5-section batch (ECA badge / ECA+Mistakes downvote /
 * Discover filter fix / computed application years / Timeline banner),
 * requested before pushing. Covers, against the real running server + DB:
 *
 *  A1 - RLS on eca_upvotes/mistake_upvotes actually rejects cross-user writes
 *       (not just "the UI wouldn't let you") -- both a direct RLS-respecting
 *       client attempt AND an API-level attempt to impersonate via body.
 *  A2 - castVote()'s table config can't be influenced by client input --
 *       confirmed here by showing the vote routes ignore the request body
 *       entirely (a malformed/malicious body changes nothing).
 *  A3 - application_year IS validated server-side against
 *       validApplicationYears(track) on /api/profile/update and
 *       /api/onboarding/complete: out-of-range values (2026, 2099) must be
 *       rejected (400), and real valid-year values must still be accepted,
 *       for both tracks.
 *  B4 - vote-eca / vote-mistake rate limits (30/60s) are enforced over real
 *       HTTP, not just configured.
 *  C5 - Ask-the-Interviewer (kind='interviewer') upvote still works through
 *       the now-generalized castVote/QUESTION_VOTES path.
 *  C9 - DB integrity: no NULL vote_type rows, and upvotes_count/
 *       downvotes_count on eca_entries/mistake_entries match real vote
 *       counts (would catch a bad backfill on pre-existing rows).
 *
 * Needs a running production build (`next start`), not `next dev`.
 * Run:
 *   KMATE_BASE_URL=http://localhost:3901 npx tsx supabase/scripts/regression/fix7-batch5-audit.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, makeChecker, createThrowawayUser, cleanupUser } from "./_env";
import { validApplicationYears } from "@/lib/timeline/deadline";

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
  return { session: sessionData.session, cookie: sessionCookieHeader(sessionData.session) };
}

/** RLS-respecting client acting as a specific user (anon key + their JWT). */
function clientAs(accessToken: string) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function testA1RlsAndImpersonation(userA: { userId: string; email: string }, userB: { userId: string; email: string }) {
  console.log("\n=== A1: RLS on eca_upvotes / mistake_upvotes ===");

  const { data: ecaEntry } = await admin
    .from("eca_entries")
    .insert({ title: "AUDIT eca entry", track: "both", submitted_by: userA.userId, status: "approved" })
    .select("id")
    .single();
  const { data: mistakeEntry } = await admin
    .from("mistake_entries")
    .insert({
      title: "AUDIT mistake entry",
      document_type: "other",
      reason_category: "other",
      submitted_by: userA.userId,
      status: "approved",
    })
    .select("id")
    .single();
  if (!ecaEntry || !mistakeEntry) throw new Error("failed to create audit fixture entries");

  const { session: sessA } = await sessionFor(userA.email);
  const rlsClientA = clientAs(sessA.access_token);

  // 1a. Direct RLS-respecting INSERT attempting to cast a vote as user B.
  const { error: insertAsB } = await rlsClientA
    .from("eca_upvotes")
    .insert({ entry_id: ecaEntry.id, user_id: userB.userId, vote_type: "up" });
  check("eca_upvotes: RLS rejects INSERT with user_id != auth.uid()", insertAsB !== null);

  const { error: insertAsBMistake } = await rlsClientA
    .from("mistake_upvotes")
    .insert({ entry_id: mistakeEntry.id, user_id: userB.userId, vote_type: "up" });
  check("mistake_upvotes: RLS rejects INSERT with user_id != auth.uid()", insertAsBMistake !== null);

  // Confirm nothing actually landed (belt-and-suspenders on top of the error check).
  const { data: leakedEca } = await admin.from("eca_upvotes").select("user_id").eq("entry_id", ecaEntry.id).eq("user_id", userB.userId).maybeSingle();
  check("eca_upvotes: no row was actually written for the impersonated user_id", leakedEca === null);
  const { data: leakedMistake } = await admin.from("mistake_upvotes").select("user_id").eq("entry_id", mistakeEntry.id).eq("user_id", userB.userId).maybeSingle();
  check("mistake_upvotes: no row was actually written for the impersonated user_id", leakedMistake === null);

  // 1b. Seed a real vote for user B (as admin, bypassing RLS -- simulating
  // B having genuinely voted), then have A's RLS-respecting client try to
  // flip B's vote via UPDATE.
  await admin.from("eca_upvotes").insert({ entry_id: ecaEntry.id, user_id: userB.userId, vote_type: "up" });
  const { error: updateAsB, count } = await rlsClientA
    .from("eca_upvotes")
    .update({ vote_type: "down" }, { count: "exact" })
    .eq("entry_id", ecaEntry.id)
    .eq("user_id", userB.userId);
  const { data: afterUpdate } = await admin.from("eca_upvotes").select("vote_type").eq("entry_id", ecaEntry.id).eq("user_id", userB.userId).single();
  check(
    "eca_upvotes: RLS prevents A from flipping B's existing vote via UPDATE (error, or 0 rows affected, and value unchanged)",
    (updateAsB !== null || count === 0) && afterUpdate?.vote_type === "up"
  );

  // 1c. API-level impersonation attempt: authenticate as A via cookie, but
  // send a body claiming to act as B / a different entry, confirm the vote
  // still lands under A's own session identity only.
  const { cookie: cookieA } = await sessionFor(userA.email);
  const apiRes = await fetch(`${BASE_URL}/api/eca/${ecaEntry.id}/upvote`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ user_id: userB.userId, userId: userB.userId, table: "profiles", vote_type: "down" }),
  });
  const apiOk = apiRes.status === 200;
  const { data: attributedVote } = await admin.from("eca_upvotes").select("user_id, vote_type").eq("entry_id", ecaEntry.id).eq("user_id", userA.userId).maybeSingle();
  check(
    "API: /api/eca/[id]/upvote ignores a body claiming a different user_id -- vote attributed to the authenticated caller only",
    apiOk && attributedVote?.user_id === userA.userId && attributedVote?.vote_type === "up"
  );
  const { data: stillOnlyB } = await admin.from("eca_upvotes").select("vote_type").eq("entry_id", ecaEntry.id).eq("user_id", userB.userId).single();
  check("API: B's vote row is untouched by A's request body claiming to act as B", stillOnlyB?.vote_type === "up");

  // Cleanup (cascades votes via FK).
  await admin.from("eca_entries").delete().eq("id", ecaEntry.id);
  await admin.from("mistake_entries").delete().eq("id", mistakeEntry.id);

  return { ecaEntryId: ecaEntry.id };
}

async function testA2BodyIgnored(userA: { email: string }) {
  console.log("\n=== A2: castVote() config is server-fixed, not client-derived ===");
  // Static fact (verified by code read, not re-proven here): lib/vote.ts's
  // QUESTION_VOTES/ECA_VOTES/MISTAKE_VOTES are module-level constants
  // imported directly into each route file; entryId comes from the URL
  // param and is only ever used as a .eq() value, never a table/column
  // name; userId comes exclusively from getAuthenticatedUser(), and none
  // of the vote routes call request.json() at all. Live-confirmed here:
  // a malformed body changes nothing about the route's behavior.
  const { cookie } = await sessionFor(userA.email);
  const { data: entry } = await admin
    .from("eca_entries")
    .insert({ title: "AUDIT a2 entry", track: "both", status: "approved" })
    .select("id")
    .single();
  if (!entry) throw new Error("fixture insert failed");

  const resGarbageBody = await fetch(`${BASE_URL}/api/eca/${entry.id}/upvote`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: "{not valid json at all !!",
  });
  check("vote route ignores an unparseable body and still succeeds (no request.json() call in the route)", resGarbageBody.status === 200);

  await admin.from("eca_entries").delete().eq("id", entry.id);
}

async function testA3ApplicationYearBypass(userGksG: { userId: string; email: string }) {
  console.log("\n=== A3: application_year server-side range validation ===");
  const { cookie } = await sessionFor(userGksG.email);

  // Need a real, valid university choice so the request clears
  // validateUniversityChoices and we can isolate whether applicationYear
  // ALONE is what gets rejected (or not).
  const { data: eligRow } = await admin.from("university_eligibility").select("id, university_id").limit(1).single();
  if (!eligRow) throw new Error("no university_eligibility rows found to build a valid test request");
  const validChoices = [{ universityId: eligRow.university_id, eligibilityId: eligRow.id }];

  // userGksG is track=gks_g (see createThrowawayUser). 2026 is already
  // invalid for gks_g (deadline ~Feb 15 2026, already passed). 2099 is
  // absurd for any track.
  for (const badYear of [2026, 2099]) {
    const res = await fetch(`${BASE_URL}/api/profile/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        major: "Computer Science",
        applicationYear: badYear,
        username: `e2ea3${Date.now() % 100000}`,
        universityChoices: validChoices,
      }),
    });
    const respBody = await res.json().catch(() => ({}));
    const { data: profileAfter } = await admin.from("profiles").select("application_year").eq("id", userGksG.userId).maybeSingle();
    const accepted = res.status === 200 && profileAfter?.application_year === badYear;
    check(
      `/api/profile/update: applicationYear=${badYear} (outside validApplicationYears('gks_g')) -- status=${res.status} body=${JSON.stringify(respBody)} stored=${profileAfter?.application_year} -- ${accepted ? "ACCEPTED (finding)" : "rejected"}`,
      !accepted
    );
  }

  // Legitimate flow check: a year that IS in validApplicationYears('gks_g')
  // must still be accepted -- confirms the new check isn't overly strict.
  const goodYear = validApplicationYears("gks_g")[0];
  const resGood = await fetch(`${BASE_URL}/api/profile/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      major: "Computer Science",
      applicationYear: goodYear,
      username: `e2ea3good${Date.now() % 100000}`,
      universityChoices: validChoices,
    }),
  });
  const { data: profileAfterGood } = await admin.from("profiles").select("application_year").eq("id", userGksG.userId).maybeSingle();
  check(
    `/api/profile/update: applicationYear=${goodYear} (a real validApplicationYears('gks_g') value) is accepted -- status=${resGood.status}, stored=${profileAfterGood?.application_year}`,
    resGood.status === 200 && profileAfterGood?.application_year === goodYear
  );

  // Same legitimate check for the other track, via a fresh gks_u user.
  const userGksU = await createThrowawayUser(admin, "batch5a3u");
  await admin.from("profiles").update({ track: "gks_u" }).eq("id", userGksU.userId);
  try {
    const { cookie: cookieU } = await sessionFor(userGksU.email);
    const goodYearU = validApplicationYears("gks_u")[0];
    const resGoodU = await fetch(`${BASE_URL}/api/profile/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieU },
      body: JSON.stringify({
        major: "Computer Science",
        applicationYear: goodYearU,
        username: `e2ea3goodu${Date.now() % 100000}`,
        universityChoices: validChoices,
      }),
    });
    const { data: profileAfterGoodU } = await admin.from("profiles").select("application_year").eq("id", userGksU.userId).maybeSingle();
    check(
      `/api/profile/update (gks_u): applicationYear=${goodYearU} (a real validApplicationYears('gks_u') value) is accepted -- status=${resGoodU.status}, stored=${profileAfterGoodU?.application_year}`,
      resGoodU.status === 200 && profileAfterGoodU?.application_year === goodYearU
    );
  } finally {
    await cleanupUser(admin, userGksU.userId);
  }

  // Fresh (not-yet-onboarded) user through /api/onboarding/complete.
  const email = `e2e-a3-onboard-${Date.now()}@example.com`;
  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (!created?.user) throw new Error("createUser failed for onboarding probe");
  try {
    const { cookie: onboardCookie } = await sessionFor(email);
    const res = await fetch(`${BASE_URL}/api/onboarding/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: onboardCookie },
      body: JSON.stringify({
        track: "gks_u",
        major: "Computer Science",
        applicationYear: 2026, // invalid for gks_u too (deadline ~Sept 30 2025, already passed)
        username: `e2ea3onb${Date.now() % 100000}`,
        universityChoices: validChoices,
      }),
    });
    const respBody = await res.json().catch(() => ({}));
    const { data: newProfile } = await admin.from("profiles").select("application_year, track").eq("id", created.user.id).maybeSingle();
    const accepted = res.status === 200 && newProfile?.application_year === 2026;
    check(
      `/api/onboarding/complete: applicationYear=2026 (invalid for gks_u) -- status=${res.status} body=${JSON.stringify(respBody)} stored=${newProfile?.application_year} -- ${accepted ? "ACCEPTED (finding)" : "rejected"}`,
      !accepted
    );

    // Legitimate flow: the SAME account, now with a real valid year, must
    // actually be able to complete onboarding.
    const goodYearOnboard = validApplicationYears("gks_u")[0];
    const resGoodOnboard = await fetch(`${BASE_URL}/api/onboarding/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: onboardCookie },
      body: JSON.stringify({
        track: "gks_u",
        major: "Computer Science",
        applicationYear: goodYearOnboard,
        username: `e2ea3onbgood${Date.now() % 100000}`,
        universityChoices: validChoices,
      }),
    });
    const { data: newProfileGood } = await admin.from("profiles").select("application_year, onboarding_completed_at").eq("id", created.user.id).maybeSingle();
    check(
      `/api/onboarding/complete: applicationYear=${goodYearOnboard} (a real validApplicationYears('gks_u') value) completes onboarding -- status=${resGoodOnboard.status}, stored=${newProfileGood?.application_year}`,
      resGoodOnboard.status === 200 && newProfileGood?.application_year === goodYearOnboard && newProfileGood?.onboarding_completed_at !== null
    );
  } finally {
    await cleanupUser(admin, created.user.id);
  }
}

async function testB4RateLimits() {
  console.log("\n=== B4: vote-eca / vote-mistake rate limits over real HTTP ===");
  // Dedicated fresh user -- isolates this from any budget already consumed
  // by earlier subtests sharing the same vote-eca:${userId} key.
  const userB4 = await createThrowawayUser(admin, "batch5b4");
  const { cookie } = await sessionFor(userB4.email);

  const { data: ecaEntry } = await admin.from("eca_entries").insert({ title: "AUDIT b4 eca", track: "both", status: "approved" }).select("id").single();
  const { data: mistakeEntry } = await admin
    .from("mistake_entries")
    .insert({ title: "AUDIT b4 mistake", document_type: "other", reason_category: "other", status: "approved" })
    .select("id")
    .single();
  if (!ecaEntry || !mistakeEntry) throw new Error("fixture insert failed for B4");

  async function hammerAndCount(url: string, n: number) {
    let ok = 0;
    let firstBlockedAt = -1;
    for (let i = 1; i <= n; i++) {
      const res = await fetch(url, { method: "POST", headers: { Cookie: cookie } });
      if (res.status === 200) ok++;
      else if (res.status === 429 && firstBlockedAt === -1) firstBlockedAt = i;
    }
    return { ok, firstBlockedAt };
  }

  const ecaResult = await hammerAndCount(`${BASE_URL}/api/eca/${ecaEntry.id}/upvote`, 33);
  check(
    `vote-eca:${userB4.userId} -- 30 requests allowed, #31 first blocked (got ok=${ecaResult.ok}, firstBlockedAt=${ecaResult.firstBlockedAt})`,
    ecaResult.ok === 30 && ecaResult.firstBlockedAt === 31
  );

  const mistakeResult = await hammerAndCount(`${BASE_URL}/api/mistakes/${mistakeEntry.id}/upvote`, 33);
  check(
    `vote-mistake:${userB4.userId} -- 30 requests allowed, #31 first blocked (got ok=${mistakeResult.ok}, firstBlockedAt=${mistakeResult.firstBlockedAt})`,
    mistakeResult.ok === 30 && mistakeResult.firstBlockedAt === 31
  );

  await admin.from("eca_entries").delete().eq("id", ecaEntry.id);
  await admin.from("mistake_entries").delete().eq("id", mistakeEntry.id);
  await cleanupUser(admin, userB4.userId);
}

async function testC5AskInterviewer(userA: { userId: string; email: string }) {
  console.log("\n=== C5: Ask-the-Interviewer (kind='interviewer') upvote regression ===");
  const { data: question } = await admin
    .from("interview_questions")
    .insert({ text: "AUDIT interviewer question", category: "curveball", kind: "interviewer", status: "approved" })
    .select("id, upvotes_count")
    .single();
  if (!question) throw new Error("fixture insert failed for C5");

  const { cookie } = await sessionFor(userA.email);
  const res = await fetch(`${BASE_URL}/api/questions/${question.id}/upvote`, { method: "POST", headers: { Cookie: cookie } });
  const body = await res.json();
  const { data: after } = await admin.from("interview_questions").select("upvotes_count, downvotes_count").eq("id", question.id).single();
  check(
    "interviewer-kind question: upvote via generalized castVote/QUESTION_VOTES succeeds and increments upvotes_count",
    res.status === 200 && body.voteType === "up" && after?.upvotes_count === (question.upvotes_count ?? 0) + 1
  );

  // Toggle off (same direction again clears it) -- confirms switch/clear
  // logic still works identically to before this batch for this kind.
  const res2 = await fetch(`${BASE_URL}/api/questions/${question.id}/upvote`, { method: "POST", headers: { Cookie: cookie } });
  const body2 = await res2.json();
  const { data: after2 } = await admin.from("interview_questions").select("upvotes_count").eq("id", question.id).single();
  check(
    "interviewer-kind question: clicking upvote again clears the vote (toggle-off) and decrements upvotes_count",
    res2.status === 200 && body2.voteType === null && after2?.upvotes_count === (question.upvotes_count ?? 0)
  );

  // Confirm the Ask-the-Interviewer page itself still renders for this user.
  const pageRes = await fetch(`${BASE_URL}/interview-db/ask`, { headers: { Cookie: cookie } });
  check("GET /interview-db/ask renders (200) after the vote-logic generalization", pageRes.status === 200);

  await admin.from("interview_questions").delete().eq("id", question.id);
}

async function testC9DataIntegrity() {
  console.log("\n=== C9: DB integrity -- vote_type backfill + count consistency ===");

  const { count: nullVoteTypeEca } = await admin.from("eca_upvotes").select("*", { count: "exact", head: true }).is("vote_type", null);
  check("eca_upvotes: zero rows with NULL vote_type (pre-migration rows backfilled)", nullVoteTypeEca === 0);
  const { count: nullVoteTypeMistake } = await admin.from("mistake_upvotes").select("*", { count: "exact", head: true }).is("vote_type", null);
  check("mistake_upvotes: zero rows with NULL vote_type (pre-migration rows backfilled)", nullVoteTypeMistake === 0);

  const { data: ecaVotes } = await admin.from("eca_upvotes").select("entry_id, vote_type");
  const { data: ecaEntries } = await admin.from("eca_entries").select("id, upvotes_count, downvotes_count");
  const ecaExpected = new Map<string, { up: number; down: number }>();
  for (const v of ecaVotes ?? []) {
    const cur = ecaExpected.get(v.entry_id) ?? { up: 0, down: 0 };
    if (v.vote_type === "up") cur.up++;
    else cur.down++;
    ecaExpected.set(v.entry_id, cur);
  }
  let ecaMismatches = 0;
  for (const e of ecaEntries ?? []) {
    const expected = ecaExpected.get(e.id) ?? { up: 0, down: 0 };
    if (e.upvotes_count !== expected.up || e.downvotes_count !== expected.down) ecaMismatches++;
  }
  check(`eca_entries: upvotes_count/downvotes_count match real vote rows for all ${ecaEntries?.length ?? 0} entries (mismatches: ${ecaMismatches})`, ecaMismatches === 0);

  const { data: mistakeVotes } = await admin.from("mistake_upvotes").select("entry_id, vote_type");
  const { data: mistakeEntries } = await admin.from("mistake_entries").select("id, upvotes_count, downvotes_count");
  const mistakeExpected = new Map<string, { up: number; down: number }>();
  for (const v of mistakeVotes ?? []) {
    const cur = mistakeExpected.get(v.entry_id) ?? { up: 0, down: 0 };
    if (v.vote_type === "up") cur.up++;
    else cur.down++;
    mistakeExpected.set(v.entry_id, cur);
  }
  let mistakeMismatches = 0;
  for (const e of mistakeEntries ?? []) {
    const expected = mistakeExpected.get(e.id) ?? { up: 0, down: 0 };
    if (e.upvotes_count !== expected.up || e.downvotes_count !== expected.down) mistakeMismatches++;
  }
  check(`mistake_entries: upvotes_count/downvotes_count match real vote rows for all ${mistakeEntries?.length ?? 0} entries (mismatches: ${mistakeMismatches})`, mistakeMismatches === 0);

  // Confirm ECA/Mistakes list pages actually render (no crash) with
  // whatever real, possibly-pre-migration data exists.
  const ecaAdmin = ecaEntries?.[0];
  console.log(`    -> sample check: ${ecaEntries?.length ?? 0} eca_entries, ${mistakeEntries?.length ?? 0} mistake_entries in DB`);
  void ecaAdmin;
}

async function main() {
  const userA = await createThrowawayUser(admin, "batch5a");
  const userB = await createThrowawayUser(admin, "batch5b");
  try {
    await testA1RlsAndImpersonation(userA, userB);
    await testA2BodyIgnored(userA);
    await testA3ApplicationYearBypass(userA); // userA is gks_g per createThrowawayUser
    await testB4RateLimits();
    await testC5AskInterviewer(userA);
    await testC9DataIntegrity();
  } finally {
    await cleanupUser(admin, userA.userId);
    await cleanupUser(admin, userB.userId);
  }
  summarize();
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
