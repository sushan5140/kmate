/**
 * Regression test for the CRITICAL finding fixed in Phase 2: a signed-in user
 * could PATCH their own profiles row with { is_admin: true } and the
 * profiles_update_own RLS policy (auth.uid() = id, no WITH CHECK) would let
 * it through. Fixed by the guard_profiles_is_admin() BEFORE UPDATE trigger
 * (supabase/schema.sql), which reverts is_admin unless the actor is already
 * an admin.
 *
 * Run: npx tsx supabase/scripts/regression/fix1-admin-escalation.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, makeChecker, createThrowawayUser, cleanupUser } from "./_env";

const env = loadEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { check, summarize } = makeChecker();

async function sessionClientFor(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.action_link) throw new Error(`generateLink failed: ${error?.message}`);
  const res = await fetch(data.properties.action_link, { redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) throw new Error("no redirect location from magic link");
  const hash = new URLSearchParams(new URL(location).hash.slice(1));
  const access_token = hash.get("access_token")!;
  const refresh_token = hash.get("refresh_token")!;
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: setErr } = await client.auth.setSession({ access_token, refresh_token });
  if (setErr) throw new Error(`setSession failed: ${setErr.message}`);
  return client;
}

async function main() {
  const { userId } = await createThrowawayUser(admin, "fix1");
  try {
    const own = await sessionClientFor((await admin.auth.admin.getUserById(userId)).data.user!.email!);

    // Attack: a non-admin tries to set is_admin=true on their own row.
    await own.from("profiles").update({ is_admin: true }).eq("id", userId);
    const { data: afterAttack } = await admin.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
    check("self-escalation to is_admin=true is silently reverted", afterAttack?.is_admin === false);

    // Legitimate: the same user updating an ordinary field on their own row
    // must still work -- the trigger should only ever touch is_admin.
    const { error: bioErr } = await own.from("profiles").update({ bio: "regression test bio" }).eq("id", userId);
    const { data: afterBio } = await admin.from("profiles").select("bio").eq("id", userId).maybeSingle();
    check("legitimate own-row field update (bio) still works", !bioErr && afterBio?.bio === "regression test bio");
  } finally {
    await cleanupUser(admin, userId);
  }
  if (!summarize()) process.exit(1);
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
