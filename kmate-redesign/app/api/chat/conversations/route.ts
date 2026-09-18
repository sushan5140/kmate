import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Find-or-create the 1:1 conversation between the caller and one other user.
 *
 * Deliberately does NOT re-implement the "are these two connected / has
 * either blocked the other" checks in application code. Those live in the
 * on_conversations_guard trigger (see supabase/schema.sql), which fires even
 * for the service-role client this route uses -- so the gate holds here
 * without being duplicated, and can't drift out of sync with the RLS copy of
 * the same rule.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`chat-conversations:${user.id}`, 60, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { otherUserId } = (await request.json()) as { otherUserId?: string };
  if (!otherUserId || typeof otherUserId !== "string" || otherUserId === user.id) {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // conversations enforces user_a_id < user_b_id, so the pair has exactly one
  // canonical representation and lookup never has to try both orderings.
  const [userA, userB] = user.id < otherUserId ? [user.id, otherUserId] : [otherUserId, user.id];

  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("user_a_id", userA)
    .eq("user_b_id", userB)
    .maybeSingle();
  if (existing) return NextResponse.json({ conversationId: existing.id });

  const { data: created, error } = await admin
    .from("conversations")
    .insert({ user_a_id: userA, user_b_id: userB })
    .select("id")
    .single();

  if (created) return NextResponse.json({ conversationId: created.id }, { status: 201 });

  // 23505 = someone created the same pair between our select and insert.
  if (error?.code === "23505") {
    const { data: raced } = await admin
      .from("conversations")
      .select("id")
      .eq("user_a_id", userA)
      .eq("user_b_id", userB)
      .maybeSingle();
    if (raced) return NextResponse.json({ conversationId: raced.id });
  }

  // The guard trigger raises for "no accepted connection" / "block exists".
  // Shouldn't be reachable from the UI (Message is only offered to connected,
  // unblocked users) but is surfaced honestly rather than as a 500.
  const message = error?.message ?? "";
  if (/accepted connection/i.test(message)) {
    return NextResponse.json({ error: "not_connected" }, { status: 403 });
  }
  if (/block/i.test(message)) {
    return NextResponse.json({ error: "blocked" }, { status: 403 });
  }

  console.error("conversation create failed:", error);
  return NextResponse.json({ error: "server_error" }, { status: 500 });
}
