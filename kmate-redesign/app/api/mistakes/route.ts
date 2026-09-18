import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { MISTAKE_DOCUMENT_TYPES, MISTAKE_REASON_CATEGORIES } from "@/lib/constants";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title, description, documentType, reasonCategory } = (await request.json()) as {
    title: string;
    description?: string;
    documentType: string;
    reasonCategory: string;
  };
  if (!title || typeof title !== "string" || title.trim().length < 4 || title.length > 120) {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }
  if (description && (typeof description !== "string" || description.length > 500)) {
    return NextResponse.json({ error: "invalid_description" }, { status: 400 });
  }
  if (!MISTAKE_DOCUMENT_TYPES.includes(documentType as (typeof MISTAKE_DOCUMENT_TYPES)[number])) {
    return NextResponse.json({ error: "invalid_document_type" }, { status: 400 });
  }
  if (!MISTAKE_REASON_CATEGORIES.includes(reasonCategory as (typeof MISTAKE_REASON_CATEGORIES)[number])) {
    return NextResponse.json({ error: "invalid_reason_category" }, { status: 400 });
  }

  const rateLimit = checkRateLimit(`submit-mistake:${user.id}`, 5, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { error } = await getSupabaseAdmin().from("mistake_entries").insert({
    title: title.trim(),
    description: description?.trim() || null,
    document_type: documentType,
    reason_category: reasonCategory,
    submitted_by: user.id,
    status: "pending",
  });

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
