import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { loadAnswers } from "@/lib/gks/store";

const MAX_ANSWER_LENGTH = 4000;

/**
 * Posts the caller's own answer to a GKS question.
 *
 * Always origin 'kmate_user' with a real author_id -- there is no code path
 * that lets a request choose its own origin, so nothing posted here can ever
 * be rendered with a community alias, and nothing imported can ever be
 * rendered with a KMate username.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`gks-answer:${user.id}`, 10, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id: questionId } = await params;
  const payload = await request.json().catch(() => null);
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (body.length < 2 || body.length > MAX_ANSWER_LENGTH) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { error } = await admin.from("gks_answers").insert({
    question_id: questionId,
    origin: "kmate_user",
    author_id: user.id,
    body,
  });
  if (error) return NextResponse.json({ error: "post_failed" }, { status: 400 });

  // Return the whole list rather than just the new row: posting changes the
  // ordering, and the client shouldn't have to re-derive that itself.
  const answers = await loadAnswers(admin, questionId, user.id);
  return NextResponse.json({ answers });
}
