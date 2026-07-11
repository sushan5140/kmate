import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();

  const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { action } = (await request.json()) as { action: "approve" | "reject" };
  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const { error } = await admin
    .from("mistake_entries")
    .update({ status: action === "approve" ? "approved" : "rejected" })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
