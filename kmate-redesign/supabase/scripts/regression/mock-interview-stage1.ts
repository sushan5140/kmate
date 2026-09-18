/**
 * Stage 1 functional check for the AI Mock Interview port: confirms the new
 * route is reachable, auth-gated, and linked from Interview DB for a real
 * onboarded user -- not just "build succeeded". Uses a throwaway user via
 * Supabase admin + magic-link cookie, same pattern as fix7c.
 *
 * Run: npx tsx supabase/scripts/regression/mock-interview-stage1.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, makeChecker, createThrowawayUser, cleanupUser } from "./_env";

const env = loadEnvLocal();
const BASE_URL = process.env.KMATE_BASE_URL ?? "http://localhost:3000";
const PROJECT_REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const COOKIE_KEY = `sb-${PROJECT_REF}-auth-token`;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { check, summarize } = makeChecker();

function b64(str: string) {
  return Buffer.from(str, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function cookieFor(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.action_link) throw new Error(`generateLink failed: ${error?.message}`);
  const res = await fetch(data.properties.action_link, { redirect: "manual" });
  const location = res.headers.get("location")!;
  const hash = new URLSearchParams(new URL(location).hash.slice(1));
  const plain = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionData } = await plain.auth.setSession({
    access_token: hash.get("access_token")!,
    refresh_token: hash.get("refresh_token")!,
  });
  const encoded = "base64-" + b64(JSON.stringify(sessionData!.session));
  return `${COOKIE_KEY}=${encoded}`;
}

async function main() {
  // --- unauthenticated: both routes must redirect to /login ---
  const unauthDb = await fetch(`${BASE_URL}/interview-db`, { redirect: "manual" });
  check("Unauth: /interview-db redirects (307)", unauthDb.status === 307);
  check(
    "Unauth: /interview-db redirects to /login?next=/interview-db",
    (unauthDb.headers.get("location") ?? "").includes("/login?next=%2Finterview-db")
  );

  const unauthMock = await fetch(`${BASE_URL}/interview-db/mock-interview`, { redirect: "manual" });
  check("Unauth: /interview-db/mock-interview redirects (307)", unauthMock.status === 307);
  check(
    "Unauth: /interview-db/mock-interview redirects to /login?next=/interview-db/mock-interview",
    (unauthMock.headers.get("location") ?? "").includes("/login?next=%2Finterview-db%2Fmock-interview")
  );

  // --- authenticated, onboarded user ---
  const user = await createThrowawayUser(admin, "mockinterviewstage1");
  try {
    const cookie = await cookieFor(user.email);

    const dbRes = await fetch(`${BASE_URL}/interview-db`, { headers: { Cookie: cookie } });
    const dbBody = await dbRes.text();
    check("Auth: /interview-db loads (200)", dbRes.status === 200);
    check(
      "Auth: /interview-db has no server error in body",
      !dbBody.includes("Application error") && !dbBody.includes("Internal Server Error")
    );
    check("Auth: /interview-db shows the new mock-interview card copy", dbBody.includes("Try an AI mock interview"));
    check(
      "Auth: /interview-db card links to /interview-db/mock-interview",
      dbBody.includes('href="/interview-db/mock-interview"')
    );

    const mockRes = await fetch(`${BASE_URL}/interview-db/mock-interview`, { headers: { Cookie: cookie } });
    const mockBody = await mockRes.text();
    check("Auth: /interview-db/mock-interview loads (200)", mockRes.status === 200);
    check(
      "Auth: /interview-db/mock-interview has no server error in body",
      !mockBody.includes("Application error") && !mockBody.includes("Internal Server Error")
    );
    check("Auth: /interview-db/mock-interview renders its heading", mockBody.includes("AI Mock Interview"));
    check(
      "Auth: /interview-db/mock-interview has a back-link to /interview-db",
      mockBody.includes('href="/interview-db"')
    );

    console.log(`    -> /interview-db status ${dbRes.status}, /interview-db/mock-interview status ${mockRes.status}`);

    // --- schema check: tables exist and are actually empty/queryable, RLS wired ---
    const { error: sessionsErr } = await admin.from("interview_sessions").select("id").limit(1);
    check("Schema: interview_sessions table is queryable via service role", !sessionsErr);
    const { error: questionsErr } = await admin.from("interview_session_questions").select("id").limit(1);
    check("Schema: interview_session_questions table is queryable via service role", !questionsErr);

    // RLS check: anon key (no session) must NOT be able to read another user's rows.
    // Insert one row as admin, then confirm the anon client (no auth) can't see it.
    const { data: sessionRow, error: insertErr } = await admin
      .from("interview_sessions")
      .insert({ user_id: user.userId, category: "motivation", question_count: 3, max_mid_pauses: 1 })
      .select("id")
      .single();
    check("Schema: can insert a session row as service role", !insertErr && !!sessionRow);

    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: anonRead } = await anon.from("interview_sessions").select("id").eq("id", sessionRow!.id);
    check("RLS: anon (unauthenticated) client cannot read the session row", (anonRead ?? []).length === 0);
  } finally {
    await admin.from("interview_sessions").delete().eq("user_id", user.userId);
    await cleanupUser(admin, user.userId);
  }

  if (!summarize()) process.exit(1);
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
