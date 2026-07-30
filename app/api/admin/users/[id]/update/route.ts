import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { TRACKS, type Track } from "@/lib/constants";
import { checkRateLimit } from "@/lib/rate-limit";

interface UpdateUserBody {
  track?: string;
  dualTrackAccess?: boolean;
}

// Deliberately does not accept is_admin -- that stays locked to the
// bootstrap-secret ceremony (supabase/scripts/bootstrap-admin.ts), full
// stop, same as every other admin-facing route in this codebase. track and
// dual_track_access aren't guarded that strictly at the DB level (see
// guard_profiles_locked_fields in supabase/schema.sql), but they're still
// only reachable through this one isAuthorizedAdmin()-gated route -- there's
// no UI or endpoint anywhere that lets a user set either on themselves.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = getSupabaseAdmin();

  // Tighter than a normal moderation action -- this changes account-level
  // access, not a single post's status.
  const rateLimit = checkRateLimit(`admin-users-update:${user.id}`, 20, 5 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id: targetId } = await params;
  const body = (await request.json()) as UpdateUserBody;

  const updates: { track?: Track; dual_track_access?: boolean } = {};
  if (body.track !== undefined) {
    if (!TRACKS.includes(body.track as Track)) {
      return NextResponse.json({ error: "invalid_track" }, { status: 400 });
    }
    updates.track = body.track as Track;
  }
  if (body.dualTrackAccess !== undefined) {
    if (typeof body.dualTrackAccess !== "boolean") {
      return NextResponse.json({ error: "invalid_dual_track_access" }, { status: 400 });
    }
    updates.dual_track_access = body.dualTrackAccess;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  const { data: before } = await admin
    .from("profiles")
    .select("username, track, dual_track_access")
    .eq("id", targetId)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const { data: after, error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", targetId)
    .select("id, username, track, dual_track_access, is_admin, major, application_year, onboarding_completed_at")
    .maybeSingle();

  if (error || !after) return NextResponse.json({ error: "server_error" }, { status: 500 });

  const changeDescriptions: string[] = [];
  if ("track" in updates) changeDescriptions.push(`track: ${before.track ?? "(none)"} -> ${after.track}`);
  if ("dual_track_access" in updates) {
    changeDescriptions.push(`dual_track_access: ${before.dual_track_access} -> ${after.dual_track_access}`);
  }

  await admin.from("admin_actions_log").insert({
    action: "admin_update_user_track_access",
    target_user_id: targetId,
    outcome: "success",
    detail: `@${before.username ?? targetId} -- ${changeDescriptions.join(", ")} (by ${user.id})`,
  });

  return NextResponse.json({ user: after });
}
