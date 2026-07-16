import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();

  const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Tighter than the user-facing rate limits -- a compromised admin session
  // hammering approve/reject is a distinct, higher-stakes risk than a normal
  // user spamming a toggle.
  const rateLimit = checkRateLimit(`moderate-mistakes:${user.id}`, 20, 5 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
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

  // So a newly-approved entry shows up on /mistakes right away instead of
  // waiting out the cache's time-based revalidation window.
  revalidateTag("mistakes", { expire: 0 });

  return NextResponse.json({ ok: true });
}
