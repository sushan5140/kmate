import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Shared budget with DELETE below -- a block/unblock cycle still only
  // costs 2 against the same hourly allowance.
  const rateLimit = checkRateLimit(`blocks:${user.id}`, 30, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { blockedId } = (await request.json()) as { blockedId: string };
  if (!blockedId || blockedId === user.id) {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from("blocks")
    .upsert({ blocker_id: user.id, blocked_id: blockedId }, { onConflict: "blocker_id,blocked_id" });

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`blocks:${user.id}`, 30, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { blockedId } = (await request.json()) as { blockedId: string };
  if (!blockedId) return NextResponse.json({ error: "invalid_target" }, { status: 400 });

  const { error } = await getSupabaseAdmin()
    .from("blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", blockedId);

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
