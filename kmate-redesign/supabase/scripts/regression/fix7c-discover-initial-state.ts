/**
 * C8 (batch-5 audit): confirms the single-select Discover filter fix
 * didn't break the "no track pill has ever been clicked yet" initial
 * state -- the page should still render sensibly (defaulting to the
 * viewer's own track), not error or show nothing.
 *
 * Needs a running production build (`next start`).
 * Run:
 *   KMATE_BASE_URL=http://localhost:3901 npx tsx supabase/scripts/regression/fix7c-discover-initial-state.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, makeChecker, createThrowawayUser, cleanupUser } from "./_env";

const env = loadEnvLocal();
const BASE_URL = process.env.KMATE_BASE_URL ?? "http://localhost:3901";
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
  const user = await createThrowawayUser(admin, "c8discover"); // gks_g per createThrowawayUser
  // Give it a peer with the same track so the initial (own-track) filter
  // has something real to return.
  const peer = await createThrowawayUser(admin, "c8discoverpeer");
  try {
    const cookie = await cookieFor(user.email);
    const res = await fetch(`${BASE_URL}/requests?tab=discover`, { headers: { Cookie: cookie } });
    const body = await res.text();
    check("Discover tab with NO track param ever set: page loads (200)", res.status === 200);
    check(
      "Discover tab initial state: no server error / stack trace in body",
      !body.includes("Application error") && !body.includes("Internal Server Error")
    );
    check("Discover tab initial state: filter UI and page content rendered", body.includes("GKS-G") && body.includes("GKS-U"));
    const { data: peerProfile } = await admin.from("profiles").select("username").eq("id", peer.userId).single();
    check(
      "Discover tab initial state: the peer sharing the viewer's own (default) track appears in results",
      Boolean(peerProfile?.username) && body.includes(peerProfile!.username)
    );
    console.log(`    -> status ${res.status}, body length ${body.length}`);
  } finally {
    await cleanupUser(admin, user.userId);
    await cleanupUser(admin, peer.userId);
  }
  if (!summarize()) process.exit(1);
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
