import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`revoke:${user.id}`, 30, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { requestId } = (await request.json()) as { requestId: string };
  if (!requestId) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const admin = getSupabaseAdmin();

  const { data: connectionRequest } = await admin
    .from("connection_requests")
    .select("id, from_user_id, to_user_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!connectionRequest || ![connectionRequest.from_user_id, connectionRequest.to_user_id].includes(user.id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (connectionRequest.status !== "accepted") {
    return NextResponse.json({ error: "not_accepted" }, { status: 409 });
  }

  const { error } = await admin
    .from("connection_requests")
    .update({ status: "revoked", responded_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
