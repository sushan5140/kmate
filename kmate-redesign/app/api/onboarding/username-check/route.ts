import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isValidUsernameFormat, escapeForIlike } from "@/lib/validation/username";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = (searchParams.get("u") ?? "").trim();

  if (!isValidUsernameFormat(username)) {
    return NextResponse.json({ available: false, reason: "invalid_format" });
  }

  const user = await getAuthenticatedUser();

  // 30/min comfortably covers the 300ms-debounced live-typing check
  // (components/onboarding/username-field.tsx) even for fast, repeated edits.
  const rateLimit = checkRateLimit(`username-check:${user?.id ?? "anon"}`, 30, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ available: false, reason: "rate_limited" }, { status: 429 });
  }

  let query = getSupabaseAdmin()
    .from("profiles")
    .select("id")
    .ilike("username", escapeForIlike(username));

  if (user) {
    query = query.neq("id", user.id);
  }

  const { data } = await query.maybeSingle();

  return NextResponse.json({ available: !data });
}
