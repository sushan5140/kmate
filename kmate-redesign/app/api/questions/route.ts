import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { QUESTION_CATEGORIES } from "@/lib/constants";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { text, category, kind } = (await request.json()) as { text: string; category: string; kind?: string };
  if (!text || typeof text !== "string" || text.trim().length < 8 || text.length > 500) {
    return NextResponse.json({ error: "invalid_text" }, { status: 400 });
  }
  if (!QUESTION_CATEGORIES.includes(category as (typeof QUESTION_CATEGORIES)[number])) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }
  const resolvedKind = kind === "interviewer" ? "interviewer" : "interview";

  const rateLimit = checkRateLimit(`submit-question:${user.id}`, 5, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { error } = await getSupabaseAdmin()
    .from("interview_questions")
    .insert({ text: text.trim(), category, kind: resolvedKind, submitted_by: user.id, status: "pending" });

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
