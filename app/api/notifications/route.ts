import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("notifications")
    .select("id, type, payload, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ notifications: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = (await request.json()) as { id?: string };
  const admin = getSupabaseAdmin();

  const query = admin.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id);
  const { error } = id ? await query.eq("id", id) : await query.is("read_at", null);

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
