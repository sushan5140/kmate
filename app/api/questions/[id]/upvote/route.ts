import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`upvote-question:${user.id}`, 30, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id: questionId } = await params;
  const admin = getSupabaseAdmin();

  const { data: existing } = await admin
    .from("question_upvotes")
    .select("question_id")
    .eq("question_id", questionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await admin.from("question_upvotes").delete().eq("question_id", questionId).eq("user_id", user.id);
    return NextResponse.json({ upvoted: false });
  }

  const { error } = await admin.from("question_upvotes").insert({ question_id: questionId, user_id: user.id });
  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ upvoted: true });
}
