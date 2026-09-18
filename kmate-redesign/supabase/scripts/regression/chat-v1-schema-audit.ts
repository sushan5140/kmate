/**
 * Live audit of the text-only chat v1 schema (conversations / messages /
 * message_reports + the reused blocks table).
 *
 * Tests BOTH enforcement layers, because they protect against different
 * things:
 *   - triggers/constraints, exercised with the service-role client (what a
 *     buggy server route would hit -- service role bypasses RLS entirely)
 *   - RLS policies, exercised with real per-user JWTs (what a client with the
 *     anon key would hit)
 *
 * Run: npx tsx supabase/scripts/regression/chat-v1-schema-audit.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvLocal, makeChecker, createThrowawayUser, cleanupUser } from "./_env";

const env = loadEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { check, summarize } = makeChecker();

/** RLS-respecting client acting as one specific user. */
async function clientFor(email: string): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.action_link) throw new Error(`generateLink: ${error?.message}`);
  const res = await fetch(data.properties.action_link, { redirect: "manual" });
  const loc = res.headers.get("location");
  if (!loc) throw new Error("no redirect location from magic link");
  const hash = new URLSearchParams(new URL(loc).hash.slice(1));
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${hash.get("access_token")}` } },
  });
}

const ordered = (x: string, y: string) => (x < y ? [x, y] : [y, x]);

async function main() {
  const a = await createThrowawayUser(admin, "chatA");
  const b = await createThrowawayUser(admin, "chatB");
  const c = await createThrowawayUser(admin, "chatC"); // never connected to anyone
  const [lo, hi] = ordered(a.userId, b.userId);

  try {
    // ---------------------------------------------------------------- gate
    console.log("\n=== Connection gate (trigger, service role) ===");
    const { error: noConnErr } = await admin
      .from("conversations")
      .insert({ user_a_id: lo, user_b_id: hi });
    check(
      "conversation REJECTED when no accepted connection exists",
      noConnErr !== null && /accepted connection/i.test(noConnErr.message)
    );

    await admin.from("connection_requests").insert({
      from_user_id: a.userId,
      to_user_id: b.userId,
      status: "pending",
    });
    const { error: pendingErr } = await admin
      .from("conversations")
      .insert({ user_a_id: lo, user_b_id: hi });
    check("conversation REJECTED when the connection is only 'pending'", pendingErr !== null);

    await admin
      .from("connection_requests")
      .update({ status: "accepted" })
      .eq("from_user_id", a.userId)
      .eq("to_user_id", b.userId);

    const { data: conv, error: okErr } = await admin
      .from("conversations")
      .insert({ user_a_id: lo, user_b_id: hi })
      .select("id, last_message_at")
      .single();
    check(`conversation ACCEPTED once connection is 'accepted' (err=${okErr?.message ?? "none"})`, !okErr && !!conv);
    check("last_message_at starts null", conv?.last_message_at === null);

    // ------------------------------------------------------ canonical pair
    console.log("\n=== Canonical ordering + uniqueness ===");
    const { error: reversedErr } = await admin
      .from("conversations")
      .insert({ user_a_id: hi, user_b_id: lo });
    check("reverse-ordered pair REJECTED (canonical order check)", reversedErr !== null);

    const { error: dupErr } = await admin
      .from("conversations")
      .insert({ user_a_id: lo, user_b_id: hi });
    check("duplicate pair REJECTED (unique constraint)", dupErr !== null);

    const { error: selfErr } = await admin
      .from("conversations")
      .insert({ user_a_id: a.userId, user_b_id: a.userId });
    check("self-conversation REJECTED", selfErr !== null);

    // ------------------------------------------------------------ messages
    console.log("\n=== Messages: length, last_message_at, immutability ===");
    const { error: emptyErr } = await admin
      .from("messages")
      .insert({ conversation_id: conv!.id, sender_id: a.userId, body: "" });
    check("empty body REJECTED", emptyErr !== null);

    const { error: longErr } = await admin
      .from("messages")
      .insert({ conversation_id: conv!.id, sender_id: a.userId, body: "x".repeat(5001) });
    check("body over 5000 chars REJECTED", longErr !== null);

    const { data: msg, error: msgErr } = await admin
      .from("messages")
      .insert({ conversation_id: conv!.id, sender_id: a.userId, body: "hello from A" })
      .select("id, created_at, read_at")
      .single();
    check(`valid message inserted (err=${msgErr?.message ?? "none"})`, !msgErr && !!msg);

    const { data: convAfter } = await admin
      .from("conversations")
      .select("last_message_at")
      .eq("id", conv!.id)
      .single();
    check(
      "trigger set conversations.last_message_at to the message timestamp",
      convAfter?.last_message_at === msg?.created_at
    );

    const { error: editErr } = await admin
      .from("messages")
      .update({ body: "edited!" })
      .eq("id", msg!.id);
    check("editing a message body REJECTED (immutability trigger)", editErr !== null);

    const { error: readErr } = await admin
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("id", msg!.id);
    check("setting read_at ALLOWED", readErr === null);

    // ------------------------------------------------ non-participant guard
    const { error: outsiderErr } = await admin
      .from("messages")
      .insert({ conversation_id: conv!.id, sender_id: c.userId, body: "I do not belong here" });
    check("message from a NON-participant REJECTED (guard trigger)", outsiderErr !== null);

    // ------------------------------------------------------------- blocking
    console.log("\n=== Blocking (reuses existing public.blocks) ===");
    await admin.from("blocks").insert({ blocker_id: b.userId, blocked_id: a.userId });

    const { error: blockedMsgErr } = await admin
      .from("messages")
      .insert({ conversation_id: conv!.id, sender_id: a.userId, body: "blocked attempt" });
    check(
      "message REJECTED after the OTHER user blocked the sender (symmetric check)",
      blockedMsgErr !== null && /block/i.test(blockedMsgErr.message)
    );

    // A fresh connected+blocked pair must not be able to open a conversation.
    await admin.from("connection_requests").insert({
      from_user_id: a.userId,
      to_user_id: c.userId,
      status: "accepted",
    });
    await admin.from("blocks").insert({ blocker_id: a.userId, blocked_id: c.userId });
    const [lo2, hi2] = ordered(a.userId, c.userId);
    const { error: blockedConvErr } = await admin
      .from("conversations")
      .insert({ user_a_id: lo2, user_b_id: hi2 });
    check(
      "conversation REJECTED between connected-but-blocked users",
      blockedConvErr !== null && /block/i.test(blockedConvErr.message)
    );

    await admin.from("blocks").delete().eq("blocker_id", b.userId).eq("blocked_id", a.userId);

    // ------------------------------------------------------------------ RLS
    console.log("\n=== RLS with real user JWTs ===");
    const clientA = await clientFor(a.email);
    const clientC = await clientFor(c.email);

    const { data: aSees } = await clientA.from("conversations").select("id");
    check("participant A can SELECT their own conversation", (aSees ?? []).some((r) => r.id === conv!.id));

    const { data: cSees } = await clientC.from("conversations").select("id");
    check(
      "outsider C canNOT SELECT a conversation they're not in",
      !(cSees ?? []).some((r) => r.id === conv!.id)
    );

    const { data: cMsgs } = await clientC.from("messages").select("id");
    check("outsider C canNOT SELECT messages from that conversation", (cMsgs ?? []).length === 0);

    const { data: aMsgs } = await clientA.from("messages").select("id, body");
    check("participant A CAN select messages in their conversation", (aMsgs ?? []).length > 0);

    const { error: spoofErr } = await clientA
      .from("messages")
      .insert({ conversation_id: conv!.id, sender_id: b.userId, body: "spoofing B" });
    check("RLS rejects inserting a message with someone else's sender_id", spoofErr !== null);

    const { error: cInsertErr } = await clientC
      .from("messages")
      .insert({ conversation_id: conv!.id, sender_id: c.userId, body: "outsider msg" });
    check("RLS rejects a non-participant inserting into the conversation", cInsertErr !== null);

    const { error: aOwnMsgErr } = await clientA
      .from("messages")
      .insert({ conversation_id: conv!.id, sender_id: a.userId, body: "legit via RLS" });
    check(`participant A CAN insert their own message via RLS (err=${aOwnMsgErr?.message ?? "none"})`, aOwnMsgErr === null);

    // blocked_users equivalent: users may only block as themselves
    const { error: blockSpoofErr } = await clientA
      .from("blocks")
      .insert({ blocker_id: c.userId, blocked_id: b.userId });
    check("RLS rejects creating a block on someone else's behalf", blockSpoofErr !== null);

    // ------------------------------------------------------ message reports
    console.log("\n=== message_reports ===");
    const { error: reportOkErr } = await clientA
      .from("message_reports")
      .insert({ message_id: msg!.id, reporter_id: a.userId, reason: "test report" });
    check(`participant CAN report a message in their conversation (err=${reportOkErr?.message ?? "none"})`, reportOkErr === null);

    const { error: reportOutsiderErr } = await clientC
      .from("message_reports")
      .insert({ message_id: msg!.id, reporter_id: c.userId, reason: "not my conversation" });
    check("outsider canNOT report a message from a conversation they're not in", reportOutsiderErr !== null);

    const { error: reportSpoofErr } = await clientA
      .from("message_reports")
      .insert({ message_id: msg!.id, reporter_id: c.userId, reason: "spoofed reporter" });
    check("RLS rejects reporting under someone else's reporter_id", reportSpoofErr !== null);
  } finally {
    // conversations/messages/reports cascade from profiles.
    await cleanupUser(admin, a.userId);
    await cleanupUser(admin, b.userId);
    await cleanupUser(admin, c.userId);
  }

  const ok = summarize();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
