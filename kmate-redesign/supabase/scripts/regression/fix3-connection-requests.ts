/**
 * Regression test for the HIGH finding fixed in Phase 2: the old
 * connection_requests_update_parties RLS policy let either party update a
 * request to any status, including the sender self-accepting their own
 * pending request. Fixed by splitting it into
 * connection_requests_accept_or_decline (recipient-only, target status
 * accepted/declined) and connection_requests_revoke (either party, target
 * status revoked) in supabase/schema.sql.
 *
 * Run: npx tsx supabase/scripts/regression/fix3-connection-requests.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, makeChecker, createThrowawayUser, cleanupUser } from "./_env";

const env = loadEnvLocal();
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

async function main() {
  const { userId: senderId } = await createThrowawayUser(admin, "fix3sender");
  const { userId: recipientId } = await createThrowawayUser(admin, "fix3recipient");
  try {
    const { data: req, error: insertErr } = await admin
      .from("connection_requests")
      .insert({ from_user_id: senderId, to_user_id: recipientId, status: "pending" })
      .select("id")
      .single();
    if (insertErr || !req) throw new Error(`request insert failed: ${insertErr?.message}`);
    const requestId = req.id;

    const senderClient = await sessionClientFor(senderId);
    const recipientClient = await sessionClientFor(recipientId);

    // Attack: the sender tries to accept their own request.
    await senderClient.from("connection_requests").update({ status: "accepted" }).eq("id", requestId);
    const { data: afterSelfAccept } = await admin
      .from("connection_requests")
      .select("status")
      .eq("id", requestId)
      .maybeSingle();
    check("sender self-accepting their own request is blocked", afterSelfAccept?.status === "pending");

    // Legitimate: the actual recipient accepts.
    const { error: acceptErr } = await recipientClient
      .from("connection_requests")
      .update({ status: "accepted" })
      .eq("id", requestId);
    const { data: afterRealAccept } = await admin
      .from("connection_requests")
      .select("status")
      .eq("id", requestId)
      .maybeSingle();
    check(
      "legitimate recipient accept still works",
      !acceptErr && afterRealAccept?.status === "accepted"
    );

    // Either party can revoke an accepted connection.
    const { error: revokeErr } = await senderClient
      .from("connection_requests")
      .update({ status: "revoked" })
      .eq("id", requestId);
    const { data: afterRevoke } = await admin
      .from("connection_requests")
      .select("status")
      .eq("id", requestId)
      .maybeSingle();
    check("either party can still revoke an accepted connection", !revokeErr && afterRevoke?.status === "revoked");

    await admin.from("connection_requests").delete().eq("id", requestId);
  } finally {
    await cleanupUser(admin, senderId);
    await cleanupUser(admin, recipientId);
  }
  if (!summarize()) process.exit(1);
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
