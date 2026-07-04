import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isValidUsernameFormat, escapeForIlike } from "@/lib/validation/username";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = (searchParams.get("u") ?? "").trim();

  if (!isValidUsernameFormat(username)) {
    return NextResponse.json({ available: false, reason: "invalid_format" });
  }

  const user = await getAuthenticatedUser();

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
