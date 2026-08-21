/**
 * End-to-end audit of the message email-notification pipeline
 * (app/api/messages/notify, the notified-state columns/RPC in schema.sql,
 * and the client wiring in components/chat/message-thread.tsx).
 *
 * Two phases, controlled by whether schema.sql's user_a_notified_at /
 * user_b_notified_at columns and clear_own_message_notification() exist yet
 * on the target Supabase project:
 *
 *   - SECURITY checks always run and must always pass -- they don't depend
 *     on the new schema at all (auth, sender verification, participancy).
 *   - SCHEMA-DEPENDENT checks (claim/skip/reset semantics, real send) only
 *     run if a preflight query confirms the columns exist; otherwise they're
 *     skipped with a clear message rather than failing noisily, and this
 *     doubles as proof that a missing migration degrades safely (chat still
 *     works, notify fails closed with `status: "failed"`) rather than
 *     silently mis-reporting as "already notified".
 *
 * Run: npx tsx supabase/scripts/regression/message-email-notifications.ts
 * Requires the dev server running at http://localhost:3000 (or set
 * KMATE_BASE_URL).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

async function sessionCookieFor(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.action_link) throw new Error(`generateLink failed: ${error?.message}`);
  const res = await fetch(data.properties.action_link, { redirect: "manual" });
  const hash = new URLSearchParams(new URL(res.headers.get("location")!).hash.slice(1));
  const plain = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionData } = await plain.auth.setSession({
    access_token: hash.get("access_token")!,
    refresh_token: hash.get("refresh_token")!,
  });
  const session = sessionData!.session!;
  return `${COOKIE_KEY}=base64-${b64(JSON.stringify(session))}`;
}

async function callNotify(cookie: string, body: unknown) {
  const res = await fetch(`${BASE_URL}/api/messages/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json: json as Record<string, unknown> };
}

/** A real anon-key client signed in as this user -- for calling the RPC exactly as the browser does. */
async function signedInClient(email: string): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.action_link) throw new Error(`generateLink failed: ${error?.message}`);
  const res = await fetch(data.properties.action_link, { redirect: "manual" });
  const hash = new URLSearchParams(new URL(res.headers.get("location")!).hash.slice(1));
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.setSession({ access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token")! });
  return client;
}

async function main() {
  const a = await createThrowawayUser(admin, "notifyA");
  const b = await createThrowawayUser(admin, "notifyB");
  const outsider = await createThrowawayUser(admin, "notifyC");

  // createThrowawayUser gives everyone an @example.com address, which
  // Resend correctly refuses to send to (422, "use our testing email
  // address instead"). That's a real provider rejection -- the notify route
  // releases the claim on it exactly as designed for a genuine failure,
  // which is correct behaviour but defeats every streak/dedupe test below
  // (each "failure" makes the next message look like a fresh streak rather
  // than a skip). Point both real participants at Resend's documented
  // testing address so real accept/deliver outcomes flow through instead.
  if (env.RESEND_API_KEY) {
    // Supabase enforces unique emails per user, so A and B need distinct
    // addresses -- Resend's testing domain supports +sub-addressing (both
    // still simulate a real "delivered" outcome), confirmed directly against
    // the live API before relying on it here.
    await admin.auth.admin.updateUserById(a.userId, { email: "delivered+a@resend.dev" });
    await admin.auth.admin.updateUserById(b.userId, { email: "delivered+b@resend.dev" });
    // sessionCookieFor/signedInClient generate a magic link by email, so the
    // local copies need to track the DB change too -- otherwise they'd look
    // up a login link for an address that's no longer this user's.
    a.email = "delivered+a@resend.dev";
    b.email = "delivered+b@resend.dev";
  }

  try {
    // --- setup: A and B connected, sharing a conversation --------------------
    await admin.from("connection_requests").insert({ from_user_id: a.userId, to_user_id: b.userId, status: "accepted" });
    const [lo, hi] = a.userId < b.userId ? [a.userId, b.userId] : [b.userId, a.userId];
    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .insert({ user_a_id: lo, user_b_id: hi })
      .select("id")
      .single();
    if (convErr || !conv) throw new Error(`conversation setup failed: ${convErr?.message}`);

    const cookieA = await sessionCookieFor(a.email);
    const cookieB = await sessionCookieFor(b.email);
    const cookieOutsider = await sessionCookieFor(outsider.email);

    // A real message from A, exactly as the client insert path produces.
    const { data: msg, error: msgErr } = await admin
      .from("messages")
      .insert({ conversation_id: conv.id, sender_id: a.userId, body: `notify probe ${Date.now()}` })
      .select("id")
      .single();
    if (msgErr || !msg) throw new Error(`message setup failed: ${msgErr?.message}`);

    // --- SECURITY: schema-independent -----------------------------------------
    // redirect: "manual" -- proxy.ts 307s every unauthenticated request to
    // /login before the route ever runs (see its PUBLIC_PATHS check); a
    // plain fetch would silently follow that to a normal 200 login page and
    // this check would pass for the wrong reason. The route's own 401 for
    // getAuthenticatedUser() === null is defense in depth behind that, not
    // reachable by an anonymous caller in practice.
    const unauth = await fetch(`${BASE_URL}/api/messages/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: msg.id }),
      redirect: "manual",
    });
    check(
      `unauthenticated request never reaches the route (redirected to login, status ${unauth.status})`,
      unauth.status === 307 || unauth.status === 401
    );

    const missingId = await callNotify(cookieA, {});
    check(`missing messageId is rejected (status ${missingId.status})`, missingId.status === 400);

    const fakeId = await callNotify(cookieA, { messageId: "00000000-0000-0000-0000-000000000000" });
    check(`nonexistent messageId is rejected (status ${fakeId.status})`, fakeId.status === 404);

    // B did not send this message -- must be refused, not silently notify
    // "on B's behalf" or leak that the message exists.
    const wrongSender = await callNotify(cookieB, { messageId: msg.id });
    check(`caller who isn't the sender is rejected (status ${wrongSender.status})`, wrongSender.status === 403);

    // An outsider with no relationship to this conversation at all.
    const outsiderCall = await callNotify(cookieOutsider, { messageId: msg.id });
    check(`non-participant outsider is rejected (status ${outsiderCall.status})`, outsiderCall.status === 403);

    // --- preflight: does the target project have the new schema yet? ---------
    const { error: schemaProbeError } = await admin
      .from("conversations")
      .select("user_a_notified_at")
      .eq("id", conv.id)
      .limit(1);
    const schemaApplied = !schemaProbeError;

    if (!schemaApplied) {
      console.log(
        `\nSCHEMA NOT YET APPLIED (${schemaProbeError!.message}) -- skipping claim/skip/reset checks.\n` +
          "Paste supabase/schema.sql into the Supabase SQL Editor and re-run this script for full coverage.\n"
      );
    }

    // --- the real sender's own call, either way -------------------------------
    const senderCall = await callNotify(cookieA, { messageId: msg.id });
    if (!schemaApplied) {
      check(
        `without the migration, the route fails closed rather than crashing (status ${senderCall.status}, body ${JSON.stringify(senderCall.json)})`,
        senderCall.status === 200 && senderCall.json.status === "failed"
      );
    } else {
      check(
        `first notify for a fresh unread streak reports a real outcome (got ${JSON.stringify(senderCall.json)})`,
        senderCall.status === 200 && typeof senderCall.json.status === "string"
      );
    }

    // Whatever the notify route did, the chat message itself must be
    // completely unaffected -- this is the core promise of the whole design.
    const { data: stillThere } = await admin.from("messages").select("id, body").eq("id", msg.id).maybeSingle();
    check("the chat message is unaffected regardless of notify outcome", stillThere?.id === msg.id);

    if (schemaApplied) {
      // --- dedupe: a second message in the same unread streak must NOT
      // re-notify --------------------------------------------------------------
      const { data: msg2 } = await admin
        .from("messages")
        .insert({ conversation_id: conv.id, sender_id: a.userId, body: `notify probe 2 ${Date.now()}` })
        .select("id")
        .single();
      const secondCall = await callNotify(cookieA, { messageId: msg2!.id });
      check(
        `a second message in the same unread streak is skipped (got ${JSON.stringify(secondCall.json)})`,
        secondCall.json.status === "skipped_already_notified"
      );

      // --- reset RPC: called as B (the recipient), exactly what
      // markRead() does client-side -- verifies it clears B's own column,
      // leaves A's column alone, and that a non-participant's call is a
      // harmless no-op ------------------------------------------------------
      const aColumn = a.userId === lo ? "user_a_notified_at" : "user_b_notified_at";
      const bColumn = b.userId === lo ? "user_a_notified_at" : "user_b_notified_at";

      const { data: beforeReset } = await admin.from("conversations").select(aColumn + "," + bColumn).eq("id", conv.id).single();
      check(
        `precondition: B's column is claimed (non-null) before B reads (got ${JSON.stringify(beforeReset)})`,
        (beforeReset as Record<string, unknown> | null)?.[bColumn] != null
      );
      // Give A's own column a sentinel value first, so clearing B's column
      // can be proven NOT to also clear A's.
      const sentinel = new Date().toISOString();
      await admin.from("conversations").update({ [aColumn]: sentinel }).eq("id", conv.id);

      const clientB = await signedInClient(b.email);
      const { error: rpcErr } = await clientB.rpc("clear_own_message_notification", { conv_id: conv.id });
      check(`clear_own_message_notification succeeds for a real participant (err=${rpcErr?.message ?? "none"})`, !rpcErr);

      // Postgres round-trips timestamptz as "...+00:00" rather than the
      // "...Z" a JS Date produces -- same instant, different string, so
      // compare as timestamps, not strings.
      const sameInstant = (value: unknown) => typeof value === "string" && new Date(value).getTime() === new Date(sentinel).getTime();

      const { data: afterB } = await admin.from("conversations").select(aColumn + "," + bColumn).eq("id", conv.id).single();
      const afterBRow = afterB as Record<string, unknown> | null;
      check("B's own RPC call clears B's column", afterBRow?.[bColumn] == null);
      check(
        `B's own RPC call does NOT touch A's column (expected ${sentinel}, got ${JSON.stringify(afterBRow?.[aColumn])})`,
        sameInstant(afterBRow?.[aColumn])
      );

      // An outsider with no stake in this conversation: harmless no-op, not
      // an error, and definitely no effect on either real participant's state.
      const clientOutsider = await signedInClient(outsider.email);
      const { error: outsiderRpcErr } = await clientOutsider.rpc("clear_own_message_notification", { conv_id: conv.id });
      const { data: afterOutsider } = await admin.from("conversations").select(aColumn).eq("id", conv.id).single();
      check(
        `a non-participant's RPC call is a no-op, not an error (err=${outsiderRpcErr?.message ?? "none"})`,
        !outsiderRpcErr && sameInstant((afterOutsider as Record<string, unknown> | null)?.[aColumn])
      );

      // Clean the sentinel back to null so the rest of the script sees a
      // normal "both read" state before the concurrency test below.
      await admin.from("conversations").update({ [aColumn]: null }).eq("id", conv.id);

      // --- concurrency: two near-simultaneous claims for the same streak
      // must not both win ---------------------------------------------------
      const { data: msg3 } = await admin
        .from("messages")
        .insert({ conversation_id: conv.id, sender_id: a.userId, body: `notify probe 3 ${Date.now()}` })
        .select("id")
        .single();

      const { data: msg3b } = await admin
        .from("messages")
        .insert({ conversation_id: conv.id, sender_id: a.userId, body: `notify probe 3b ${Date.now()}` })
        .select("id")
        .single();
      const [race1, race2] = await Promise.all([
        callNotify(cookieA, { messageId: msg3!.id }),
        callNotify(cookieA, { messageId: msg3b!.id }),
      ]);
      // Whether the winner goes on to actually SEND (needs a real
      // RESEND_API_KEY) or fails at the provider step doesn't matter for
      // this check -- only that the atomic claim itself was exclusive:
      // exactly one of the two calls should see "already notified", proving
      // the other one truly won the UPDATE ... WHERE col IS NULL race, not
      // that both independently believed they'd won.
      const outcomes = [race1.json.status, race2.json.status];
      const skips = outcomes.filter((o) => o === "skipped_already_notified").length;
      check(
        `two near-simultaneous messages in the same streak: exactly one is skipped as already-notified, not zero or two (got ${JSON.stringify(outcomes)})`,
        skips === 1
      );

      // --- reset on read: after B reads, a new message starts a new streak ----
      await admin.from("conversations").update({ user_a_notified_at: null, user_b_notified_at: null }).eq("id", conv.id);
      const { data: msg4 } = await admin
        .from("messages")
        .insert({ conversation_id: conv.id, sender_id: a.userId, body: `notify probe 4 ${Date.now()}` })
        .select("id")
        .single();
      const afterReset = await callNotify(cookieA, { messageId: msg4!.id });
      check(
        `after a reset (simulating B having read), the next message starts a new streak (got ${JSON.stringify(afterReset.json)})`,
        afterReset.json.status !== "skipped_already_notified"
      );

      // --- B -> A must also notify (never the sender) --------------------------
      const { data: replyMsg } = await admin
        .from("messages")
        .insert({ conversation_id: conv.id, sender_id: b.userId, body: `reply probe ${Date.now()}` })
        .select("id")
        .single();
      const replyCall = await callNotify(cookieB, { messageId: replyMsg!.id });
      check(
        `B -> A also triggers a real notify attempt, not a skip (got ${JSON.stringify(replyCall.json)})`,
        replyCall.json.status !== "skipped_already_notified"
      );

      // A must never be able to trigger a notification for B's own message.
      const spoofCall = await callNotify(cookieA, { messageId: replyMsg!.id });
      check(`sender A cannot piggyback a notify for B's message (status ${spoofCall.status})`, spoofCall.status === 403);
    }
  } finally {
    await cleanupUser(admin, a.userId);
    await cleanupUser(admin, b.userId);
    await cleanupUser(admin, outsider.userId);
  }

  process.exit(summarize() ? 0 : 1);
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
