import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { isChoiceId, isMatchCycle, isMatchStage } from "@/lib/connections/stage-matching";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return fail("unauthorized", 401);
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("invalid_origin", 403);
  const rate = checkRateLimit("stage-matching:" + user.id, 30, 60 * 60 * 1000);
  if (!rate.allowed) return fail("rate_limited", 429);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return fail("invalid_body", 400);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("invalid_body", 400);
    body = parsed as Record<string, unknown>;
  } catch { return fail("invalid_body", 400); }

  const admin = getSupabaseAdmin();
  // Revocation remains available even if matching is switched off.
  if (body.action === "disable") {
    const { error } = await admin.from("stage_matching_preferences").delete().eq("user_id", user.id);
    return error ? fail("unable_to_revoke", 503) : NextResponse.json({ ok: true });
  }
  if (process.env.KMATE_STAGE_MATCHING_ENABLED !== "true") return fail("pilot_disabled", 503);
  if (body.action !== "enable" || body.consent !== true || !isChoiceId(body.choiceId) || !isMatchStage(body.stage)) return fail("invalid_consent", 400);
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("track, application_year, onboarding_completed_at, deleted_at, username").eq("id", user.id).maybeSingle();
  if (profileError) return fail("unable_to_check_profile", 503);
  if (!profile?.username || !profile.onboarding_completed_at || profile.deleted_at ||
    !isMatchCycle(profile.application_year) || !["gks_u","gks_g"].includes(profile.track)) return fail("profile_incomplete", 400);
  const { data: choice, error: choiceError } = await admin.from("university_choices").select("id").eq("id", body.choiceId).eq("user_id", user.id).maybeSingle();
  if (choiceError) return fail("unable_to_check_choice", 503);
  if (!choice) return fail("invalid_choice", 400);
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const { error } = await admin.from("stage_matching_preferences").upsert({
    user_id: user.id, choice_id: choice.id, program: profile.track, cycle: profile.application_year,
    profile_version: profile.onboarding_completed_at, stage: body.stage,
    consented_at: now.toISOString(), expires_at: expires.toISOString(),
  }, { onConflict: "user_id" });
  return error ? fail("unable_to_save_consent", 503) : NextResponse.json({ ok: true });
}
