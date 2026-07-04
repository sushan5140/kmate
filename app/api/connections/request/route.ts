import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidNote } from "@/lib/validation/username";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { toUserId, note } = (await request.json()) as { toUserId: string; note?: string };
  if (!toUserId || typeof toUserId !== "string") {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }
  if (toUserId === user.id) {
    return NextResponse.json({ error: "cannot_connect_to_self" }, { status: 400 });
  }
  if (note && !isValidNote(note)) {
    return NextResponse.json({ error: "note_too_long" }, { status: 400 });
  }

  const rateLimit = checkRateLimit(`connect:${user.id}`, 20, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const admin = getSupabaseAdmin();

  // Real enforcement of "a blocked user can't send a request" -- runs with
  // RLS bypassed via the service-role client, so this is what actually
  // executes; the matching connection_requests insert policy is the
  // defense-in-depth backstop for any path that isn't this route.
  const { data: blocked } = await admin
    .from("blocks")
    .select("blocker_id")
    .eq("blocker_id", toUserId)
    .eq("blocked_id", user.id)
    .maybeSingle();
  if (blocked) {
    return NextResponse.json({ error: "blocked" }, { status: 403 });
  }

  const { data: existingPending } = await admin
    .from("connection_requests")
    .select("id")
    .eq("status", "pending")
    .or(
      `and(from_user_id.eq.${user.id},to_user_id.eq.${toUserId}),and(from_user_id.eq.${toUserId},to_user_id.eq.${user.id})`
    )
    .maybeSingle();
  if (existingPending) {
    return NextResponse.json({ error: "request_already_pending" }, { status: 409 });
  }

  const { data: created, error } = await admin
    .from("connection_requests")
    .insert({ from_user_id: user.id, to_user_id: toUserId, note: note ?? null })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  await admin.from("notifications").insert({
    user_id: toUserId,
    type: "connection_request",
    payload: { connectionRequestId: created.id, fromUserId: user.id },
  });

  return NextResponse.json({ ok: true, status: "pending" });
}
