/**
 * Regression test for the admin-bootstrap mechanism (admin_bootstrap_promote()
 * in supabase/schema.sql, run via supabase/scripts/bootstrap-admin.ts).
 * Added after Phase 3 discovered guard_profiles_is_admin() had no path at
 * all for promoting the first admin -- see SECURITY.md "Admin bootstrap".
 *
 * Requires KMATE_TEST_SECRET to be set to whatever plaintext secret was used
 * to populate admin_bootstrap_config.secret_hash for this test run (a
 * throwaway test value, never the real one -- see that file's comment for
 * how it's set). Not the real ADMIN_BOOTSTRAP_SECRET.
 *
 * Run: KMATE_TEST_SECRET=<test-secret> npx tsx supabase/scripts/regression/fix-admin-bootstrap.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, makeChecker, createThrowawayUser, cleanupUser } from "./_env";

const env = loadEnvLocal();
const TEST_SECRET = process.env.KMATE_TEST_SECRET;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { check, summarize } = makeChecker();

async function sessionClientFor(userId: string) {
  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const email = userData.user!.email!;
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.action_link) throw new Error(`generateLink failed: ${error?.message}`);
  const res = await fetch(data.properties.action_link, { redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) throw new Error("no redirect location from magic link");
  const hash = new URLSearchParams(new URL(location).hash.slice(1));
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: setErr } = await client.auth.setSession({
    access_token: hash.get("access_token")!,
    refresh_token: hash.get("refresh_token")!,
  });
  if (setErr) throw new Error(`setSession failed: ${setErr.message}`);
  return client;
}

async function countLogRows(action: string, outcome: string) {
  const { count } = await admin
    .from("admin_actions_log")
    .select("id", { count: "exact", head: true })
    .eq("action", action)
    .eq("outcome", outcome);
  return count ?? 0;
}

async function main() {
  if (!TEST_SECRET) {
    console.error("KMATE_TEST_SECRET is required (the throwaway test secret, not the real one).");
    process.exit(1);
  }

  const { userId: targetId, email: targetEmail } = await createThrowawayUser(admin, "bootstraptarget");
  const { userId: attackerId } = await createThrowawayUser(admin, "bootstrapattacker");

  try {
    const failuresBefore = await countLogRows("admin_bootstrap_promote", "failure");
    const successesBefore = await countLogRows("admin_bootstrap_promote", "success");

    // 1. Wrong secret: must fail, target must not be promoted, and it must
    // be logged as a failure.
    const { data: wrongResult, error: wrongErr } = await admin.rpc("admin_bootstrap_promote", {
      target_email: targetEmail,
      secret: "definitely-the-wrong-secret",
    });
    const { data: afterWrong } = await admin.from("profiles").select("is_admin").eq("id", targetId).maybeSingle();
    const failuresAfterWrong = await countLogRows("admin_bootstrap_promote", "failure");
    check("wrong secret: RPC call succeeds (no exception) but returns false", !wrongErr && wrongResult === false);
    check("wrong secret: target is NOT promoted", afterWrong?.is_admin === false);
    check("wrong secret: attempt is logged as a failure", failuresAfterWrong === failuresBefore + 1);

    // 2. Right secret: must succeed, target must be promoted, logged as success.
    const { data: rightResult, error: rightErr } = await admin.rpc("admin_bootstrap_promote", {
      target_email: targetEmail,
      secret: TEST_SECRET,
    });
    const { data: afterRight } = await admin.from("profiles").select("is_admin").eq("id", targetId).maybeSingle();
    const successesAfterRight = await countLogRows("admin_bootstrap_promote", "success");
    check("right secret: RPC call returns true", !rightErr && rightResult === true);
    check("right secret: target IS promoted", afterRight?.is_admin === true);
    check("right secret: promotion is logged as a success", successesAfterRight === successesBefore + 1);

    // 3. The normal trigger guard is completely unaffected for every other
    // write path: a non-admin still can't self-promote via a plain PATCH.
    const attackerClient = await sessionClientFor(attackerId);
    await attackerClient.from("profiles").update({ is_admin: true }).eq("id", attackerId);
    const { data: attackerAfter } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", attackerId)
      .maybeSingle();
    check(
      "guard_profiles_is_admin is unaffected: a non-admin still can't self-promote via normal PATCH",
      attackerAfter?.is_admin === false
    );
  } finally {
    await cleanupUser(admin, targetId);
    await cleanupUser(admin, attackerId);
  }

  if (!summarize()) process.exit(1);
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
