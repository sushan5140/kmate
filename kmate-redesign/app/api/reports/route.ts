import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { targetType, targetId, reason } = (await request.json()) as {
    targetType: string;
    targetId: string;
    reason: string;
  };
  if (!["profile", "question", "eca", "mistake", "app"].includes(targetType)) {
    return NextResponse.json({ error: "invalid_target_type" }, { status: 400 });
  }
  if (!targetId || typeof targetId !== "string") {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }
  if (!reason || typeof reason !== "string" || reason.trim().length < 3 || reason.length > 500) {
    return NextResponse.json({ error: "invalid_reason" }, { status: 400 });
  }

  const rateLimit = checkRateLimit(`report:${user.id}`, 10, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { error } = await getSupabaseAdmin()
    .from("reports")
    .insert({ reporter_id: user.id, target_type: targetType, target_id: targetId, reason: reason.trim() });

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
