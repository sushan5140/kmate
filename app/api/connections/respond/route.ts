import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { requestId, action } = (await request.json()) as {
    requestId: string;
    action: "accept" | "decline";
  };
  if (!requestId || !["accept", "decline"].includes(action)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: connectionRequest } = await admin
    .from("connection_requests")
    .select("id, from_user_id, to_user_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!connectionRequest || connectionRequest.to_user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (connectionRequest.status !== "pending") {
    return NextResponse.json({ error: "not_pending" }, { status: 409 });
  }

  const newStatus = action === "accept" ? "accepted" : "declined";
  const { error } = await admin
    .from("connection_requests")
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (action === "accept") {
    // The moment contact_methods becomes mutually visible per RLS.
    await admin.from("notifications").insert({
      user_id: connectionRequest.from_user_id,
      type: "connection_accepted",
      payload: { connectionRequestId: connectionRequest.id, byUserId: user.id },
    });
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
