import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Toggles "save question" for the caller.
 *
 * A saved question is private to the person who saved it, so this never
 * exposes who else saved what. The row is the storage the upcoming FAQ Trends
 * / Saved Questions feature will read from -- which is why saving points at a
 * question thread rather than at a particular answer.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`gks-save:${user.id}`, 60, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id: questionId } = await params;
  const admin = getSupabaseAdmin();

  const { data: existing } = await admin
    .from("gks_saved_questions")
    .select("question_id")
    .eq("question_id", questionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await admin
      .from("gks_saved_questions")
      .delete()
      .eq("question_id", questionId)
      .eq("user_id", user.id);
    return NextResponse.json({ saved: false });
  }

  const { error } = await admin
    .from("gks_saved_questions")
    .insert({ question_id: questionId, user_id: user.id });
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 400 });

  return NextResponse.json({ saved: true });
}
