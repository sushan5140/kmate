import { NextResponse } from "next/server";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { InterviewQuestionsPdf, type PdfVariant, type PdfQuestionItem } from "@/lib/pdf/interview-questions-pdf";
import type { QuestionCategory } from "@/lib/constants";

const VALID_VARIANTS: PdfVariant[] = ["all", "answered", "unanswered"];

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`download-questions:${user.id}`, 10, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const variant = searchParams.get("variant") as PdfVariant | null;
  if (!variant || !VALID_VARIANTS.includes(variant)) {
    return NextResponse.json({ error: "invalid_variant" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const [{ data: questions }, { data: drafts }] = await Promise.all([
    admin
      .from("interview_questions")
      .select("id, text, category")
      .eq("kind", "interview")
      .eq("status", "approved")
      .order("upvotes_count", { ascending: false }),
    admin.from("draft_answers").select("question_id, content").eq("user_id", user.id),
  ]);

  const answerByQuestionId = new Map(
    (drafts ?? []).filter((d) => d.content.trim().length > 0).map((d) => [d.question_id, d.content as string])
  );

  const items: PdfQuestionItem[] = (
    (questions ?? []) as { id: string; text: string; category: QuestionCategory }[]
  )
    .map((q) => ({
      id: q.id,
      text: q.text,
      category: q.category,
      answer: answerByQuestionId.get(q.id) ?? null,
    }))
    .filter((q) => {
      if (variant === "answered") return q.answer !== null;
      if (variant === "unanswered") return q.answer === null;
      return true;
    });

  // InterviewQuestionsPdf renders a <Document> at its root, but its own
  // element type is a plain function component -- renderToBuffer's types
  // insist on React.ReactElement<DocumentProps> specifically, so this cast
  // just tells TS what's true at runtime.
  const buffer = await renderToBuffer(
    createElement(InterviewQuestionsPdf, { variant, items }) as ReactElement<DocumentProps>
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="interview-db-${variant}.pdf"`,
    },
  });
}
