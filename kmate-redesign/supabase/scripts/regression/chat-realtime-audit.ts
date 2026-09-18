/**
 * End-to-end audit of the chat REALTIME pipeline, with real per-user JWTs.
 *
 * A correct schema does not prove the subscription wiring works: realtime also
 * needs `messages` in the supabase_realtime publication, and postgres_changes
 * must still respect messages_select_participant so a non-participant gets
 * nothing. Both are asserted here against the live project.
 *
 *   A + B are connected and share a conversation.
 *   C is a signed-in outsider subscribed to the SAME filter.
 *   B sends -> A must receive the event, C must receive nothing.
 *
 * Run: npx tsx supabase/scripts/regression/chat-realtime-audit.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvLocal, makeChecker, createThrowawayUser, cleanupUser } from "./_env";

const env = loadEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { check, summarize } = makeChecker();

async function signedInClient(email: string): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.action_link) throw new Error(`generateLink: ${error?.message}`);
  const res = await fetch(data.properties.action_link, { redirect: "manual" });
  const loc = res.headers.get("location");
  if (!loc) throw new Error("no redirect location");
  const hash = new URLSearchParams(new URL(loc).hash.slice(1));
  const access_token = hash.get("access_token")!;
  const refresh_token = hash.get("refresh_token")!;

  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.setSession({ access_token, refresh_token });
  // Realtime authorises separately from PostgREST; without this the socket
  // connects as anon and RLS-filtered changes never arrive.
  client.realtime.setAuth(access_token);
  return client;
}

/** Subscribes and resolves once SUBSCRIBED, so we never send before we're listening. */
function subscribeToConversation(
  client: SupabaseClient,
  label: string,
  conversationId: string,
  received: { id: string; body: string }[]
) {
  return new Promise<() => Promise<void>>((resolve, reject) => {
    const channel = client
      .channel(`test:${label}:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as { id: string; body: string };
          received.push({ id: m.id, body: m.body });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") resolve(async () => void (await client.removeChannel(channel)));
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(`${label}: ${status}`));
      });
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const a = await createThrowawayUser(admin, "rtA");
  const b = await createThrowawayUser(admin, "rtB");
  const c = await createThrowawayUser(admin, "rtC");
  let unsubA: (() => Promise<void>) | null = null;
  let unsubC: (() => Promise<void>) | null = null;

  try {
    await admin
      .from("connection_requests")
      .insert({ from_user_id: a.userId, to_user_id: b.userId, status: "accepted" });

    const [lo, hi] = a.userId < b.userId ? [a.userId, b.userId] : [b.userId, a.userId];
    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .insert({ user_a_id: lo, user_b_id: hi })
      .select("id")
      .single();
    if (convErr || !conv) throw new Error(`conversation setup failed: ${convErr?.message}`);

    const clientA = await signedInClient(a.email);
    const clientB = await signedInClient(b.email);
    const clientC = await signedInClient(c.email);

    const gotA: { id: string; body: string }[] = [];
    const gotC: { id: string; body: string }[] = [];

    unsubA = await subscribeToConversation(clientA, "participantA", conv.id, gotA);
    unsubC = await subscribeToConversation(clientC, "outsiderC", conv.id, gotC);
    check("both subscriptions reached SUBSCRIBED", true);

    // B sends through RLS (not the service role) -- the same path the UI uses.
    const body = `realtime probe ${Date.now()}`;
    const { data: sent, error: sendErr } = await clientB
      .from("messages")
      .insert({ conversation_id: conv.id, sender_id: b.userId, body })
      .select("id")
      .single();
    check(`B sent a message via RLS (err=${sendErr?.message ?? "none"})`, !sendErr && !!sent);

    // Poll rather than sleeping a fixed time, so a fast delivery finishes fast.
    for (let i = 0; i < 50 && gotA.length === 0; i++) await wait(200);

    check(
      `participant A RECEIVED the realtime INSERT (got ${gotA.length} event(s))`,
      gotA.some((m) => m.body === body)
    );
    check("the delivered payload carries the real message body", gotA[0]?.body === body);

    // Give any leaked event to C a fair chance to arrive before asserting.
    await wait(2500);
    check(
      `outsider C received NOTHING despite subscribing to the same filter (got ${gotC.length})`,
      gotC.length === 0
    );

    // Read receipts through the recipient-only policy.
    const { error: readErr } = await clientA
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", conv.id)
      .neq("sender_id", a.userId)
      .is("read_at", null);
    check(`recipient A can mark messages read (err=${readErr?.message ?? "none"})`, readErr === null);

    const { data: afterRead } = await admin
      .from("messages")
      .select("read_at")
      .eq("id", sent!.id)
      .single();
    check("read_at is now set on the delivered message", afterRead?.read_at !== null);

    // Sender must not be able to mark their OWN message read.
    await admin.from("messages").update({ read_at: null }).eq("id", sent!.id);
    await clientB
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("id", sent!.id);
    const { data: afterSelfRead } = await admin
      .from("messages")
      .select("read_at")
      .eq("id", sent!.id)
      .single();
    check("sender B canNOT mark their own message read", afterSelfRead?.read_at === null);
  } finally {
    if (unsubA) await unsubA();
    if (unsubC) await unsubC();
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
