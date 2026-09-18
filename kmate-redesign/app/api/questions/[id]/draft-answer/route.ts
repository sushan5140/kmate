import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: questionId } = await params;
  const { content } = (await request.json()) as { content: string };
  if (typeof content !== "string" || content.length > 10000) {
    return NextResponse.json({ error: "invalid_content" }, { status: 400 });
  }

  // Generous limit -- this covers legitimate autosave traffic, not abuse.
  const rateLimit = checkRateLimit(`draft:${user.id}`, 40, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("draft_answers")
    .upsert(
      { user_id: user.id, question_id: questionId, content, updated_at: now },
      { onConflict: "user_id,question_id" }
    );

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ ok: true, savedAt: now });
}
