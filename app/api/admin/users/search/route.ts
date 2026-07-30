import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { escapeForIlike } from "@/lib/validation/username";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = getSupabaseAdmin();

  const rateLimit = checkRateLimit(`admin-users-search:${user.id}`, 30, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ users: [] });

  const { data, error } = await admin
    .from("profiles")
    .select("id, username, track, dual_track_access, is_admin, major, application_year, onboarding_completed_at")
    .not("username", "is", null)
    .ilike("username", `%${escapeForIlike(q)}%`)
    .order("username")
    .limit(20);

  if (error) return NextResponse.json({ error: "search_failed" }, { status: 500 });

  return NextResponse.json({ users: data ?? [] });
}
