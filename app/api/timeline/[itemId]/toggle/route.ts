import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { itemId } = await params;
  const { completed } = (await request.json()) as { completed: boolean };
  if (typeof completed !== "boolean") {
    return NextResponse.json({ error: "invalid_completed" }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from("user_timeline_progress")
    .upsert(
      {
        user_id: user.id,
        timeline_template_item_id: itemId,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      },
      { onConflict: "user_id,timeline_template_item_id" }
    );

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
