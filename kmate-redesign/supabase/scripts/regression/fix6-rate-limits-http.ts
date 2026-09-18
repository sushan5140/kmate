/**
 * End-to-end HTTP regression test for Fix 6 (Phase 3, medium): confirms the
 * admin moderate routes and account/delete actually return 429 once their
 * configured limit is exceeded, hitting the real running server (not just
 * the shared lib/rate-limit.ts module in isolation -- see
 * fix5-6-rate-limits-unit.ts for that).
 *
 * Requires a running server (`next start`, since dev mode's Turbopack had an
 * unrelated cookie-auth quirk observed during Phase 3 testing -- use a
 * production build here).
 *
 * The admin-moderate check needs a session for an account that is ALREADY an
 * admin. It deliberately does NOT create one itself via a trigger bypass --
 * that mechanism was one-time-authorized for promoting a specific real
 * account in Phase 3, not for reuse by an unattended regression script.
 * Point KMATE_ADMIN_EMAIL at an existing admin account instead. The test
 * only ever targets a nonexistent UUID, so it has no effect on real data.
 *
 * Run:
 *   KMATE_BASE_URL=http://localhost:3901 KMATE_ADMIN_EMAIL=you@example.com \
 *     npx tsx supabase/scripts/regression/fix6-rate-limits-http.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, makeChecker, createThrowawayUser, cleanupUser } from "./_env";

const env = loadEnvLocal();
const BASE_URL = process.env.KMATE_BASE_URL ?? "http://localhost:3901";
const ADMIN_EMAIL = process.env.KMATE_ADMIN_EMAIL;
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

async function cookieFor(email: string) {
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

async function testAdminModerate() {
  if (!ADMIN_EMAIL) {
    console.log("SKIPPED: admin/questions/moderate rate-limit test (set KMATE_ADMIN_EMAIL to an admin account to run it)");
    return;
  }
  const cookie = await cookieFor(ADMIN_EMAIL);
  const fakeId = "00000000-0000-0000-0000-000000000000";
  let sawOk = 0;
  let firstBlockedAt = -1;
  for (let i = 1; i <= 21; i++) {
    const res = await fetch(`${BASE_URL}/api/admin/questions/${fakeId}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ action: "reject" }),
    });
    if (res.status === 200) sawOk++;
    else if (res.status === 429 && firstBlockedAt === -1) firstBlockedAt = i;
  }
  check("admin/questions/moderate: exactly 20 requests succeeded before limiting", sawOk === 20);
  check("admin/questions/moderate: request #21 was the first to be rate-limited (429)", firstBlockedAt === 21);
}

async function testAccountDelete() {
  const { userId, email } = await createThrowawayUser(admin, "fix6delete");
  try {
    const cookie = await cookieFor(email);
    let sawOk = 0;
    let firstBlockedAt = -1;
    for (let i = 1; i <= 4; i++) {
      const res = await fetch(`${BASE_URL}/api/account/delete`, { method: "POST", headers: { Cookie: cookie } });
      if (res.status === 200) sawOk++;
      else if (res.status === 429 && firstBlockedAt === -1) firstBlockedAt = i;
    }
    check("account/delete: exactly 3 requests succeeded before limiting", sawOk === 3);
    check("account/delete: request #4 was the first to be rate-limited (429)", firstBlockedAt === 4);
  } finally {
    await cleanupUser(admin, userId);
  }
}

async function main() {
  await testAdminModerate();
  await testAccountDelete();
  if (!summarize()) process.exit(1);
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
