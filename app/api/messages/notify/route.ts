import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendTransactionalEmail } from "@/lib/email/resend";
import { renderNewMessageEmail } from "@/lib/email/templates/new-message";

/**
 * Fired by the client right after a successful message insert (see send() in
 * components/chat/message-thread.tsx) -- messages themselves are written
 * directly from the browser via the Supabase client SDK, with no server
 * route in that path at all, so this is the earliest point a server-side
 * hook can exist. The message is already saved and already visible in the
 * UI by the time this runs; nothing in here can affect whether it sent.
 *
 * Takes only a messageId. Sender, recipient, and recipient email are all
 * re-derived server-side from the caller's own session and the DB -- the
 * client has no way to name an arbitrary recipient or email address.
 */

interface NotifyRequestBody {
  messageId?: string;
}

function logEvent(event: string, detail: Record<string, unknown>) {
  // Deliberately no message body, no email address, no API key in any of
  // these -- ids only. See the privacy note in lib/email/templates/new-message.ts
  // for why the email itself never quotes the message either.
  console.log(`[messages/notify] ${event}`, detail);
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`message-notify:${user.id}`, 60, 5 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as NotifyRequestBody;
  const messageId = body.messageId;
  if (!messageId) return NextResponse.json({ error: "missing_message_id" }, { status: 400 });

  const admin = getSupabaseAdmin();

  try {
    const { data: message } = await admin
      .from("messages")
      .select("id, conversation_id, sender_id")
      .eq("id", messageId)
      .maybeSingle();

    if (!message) return NextResponse.json({ error: "message_not_found" }, { status: 404 });

    // The caller must be the message's own sender -- prevents triggering a
    // notification for a message someone else sent, or spoofing on their behalf.
    if (message.sender_id !== user.id) {
      return NextResponse.json({ error: "not_the_sender" }, { status: 403 });
    }

    const { data: conversation } = await admin
      .from("conversations")
      .select("id, user_a_id, user_b_id")
      .eq("id", message.conversation_id)
      .maybeSingle();

    if (!conversation || (conversation.user_a_id !== user.id && conversation.user_b_id !== user.id)) {
      // Re-verifies participancy independently of the insert-time guard --
      // this route is its own authorization boundary, not just a trusted
      // continuation of the client's insert.
      return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
    }

    const recipientId = conversation.user_a_id === user.id ? conversation.user_b_id : conversation.user_a_id;
    const notifiedColumn = recipientId === conversation.user_a_id ? "user_a_notified_at" : "user_b_notified_at";

    // Atomic claim: only the request that flips this column from null to a
    // timestamp is responsible for sending. Two notify calls racing for the
    // same conversation+recipient (e.g. two near-simultaneous messages) can
    // both run this UPDATE, but Postgres serializes them on the row -- only
    // one WHERE ... IS NULL can match, so only one ever gets a row back.
    // This is real DB-level compare-and-swap, not an app-level check that a
    // race could slip past.
    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("conversations")
      .update({ [notifiedColumn]: claimedAt })
      .eq("id", conversation.id)
      .is(notifiedColumn, null)
      .select("id")
      .maybeSingle();

    // A query error (e.g. the notified columns don't exist yet because
    // schema.sql hasn't been applied) is NOT the same thing as "0 rows
    // matched because someone already claimed it" -- data is null either
    // way, but only the latter is a real skip. Conflating them would make a
    // broken/missing schema silently look like healthy steady-state
    // deduplication instead of a config error worth logging loudly.
    if (claimError) {
      logEvent("claim_query_error", { conversationId: conversation.id, error: claimError.message });
      return NextResponse.json({ status: "failed", reason: "claim_query_error" });
    }

    if (!claimed) {
      logEvent("skipped_already_unread", { conversationId: conversation.id, recipientId });
      return NextResponse.json({ status: "skipped_already_notified" });
    }

    // From here on, any early return must first release the claim (revert
    // the column back to null) -- otherwise a real failure would silently
    // suppress every future notification for this unread streak, with no
    // way for the recipient to ever get emailed about it. The claim is only
    // ever left set after a send the provider actually accepted.
    async function releaseClaim() {
      await admin
        .from("conversations")
        .update({ [notifiedColumn]: null })
        .eq("id", conversation!.id)
        .eq(notifiedColumn, claimedAt);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      await releaseClaim();
      logEvent("failed_missing_app_url", { conversationId: conversation.id });
      return NextResponse.json({ status: "failed", reason: "missing_app_url" });
    }

    const { data: recipientAuth, error: recipientAuthError } = await admin.auth.admin.getUserById(recipientId);
    const recipientEmail = recipientAuth?.user?.email;
    if (recipientAuthError || !recipientEmail) {
      await releaseClaim();
      logEvent("skipped_no_recipient_email", { conversationId: conversation.id, recipientId });
      return NextResponse.json({ status: "skipped_no_email" });
    }

    const { data: senderProfile } = await admin.from("profiles").select("username").eq("id", user.id).maybeSingle();
    const senderUsername = senderProfile?.username ?? "Someone";

    const { subject, html, text } = renderNewMessageEmail({
      senderUsername,
      conversationUrl: `${appUrl.replace(/\/$/, "")}/messages?c=${conversation.id}`,
    });

    const result = await sendTransactionalEmail({ to: recipientEmail, subject, html, text });

    if (!result.ok) {
      await releaseClaim();
      logEvent("provider_error", { conversationId: conversation.id, recipientId, error: result.error });
      return NextResponse.json({ status: "failed", reason: "provider_error" });
    }

    logEvent("provider_accepted", { conversationId: conversation.id, recipientId, providerId: result.id });
    return NextResponse.json({ status: "sent" });
  } catch (err) {
    // Unexpected exception anywhere above -- the message itself was already
    // saved before this route was ever called, so this can't undo that.
    logEvent("unexpected_error", { messageId, error: err instanceof Error ? err.message : "unknown" });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
