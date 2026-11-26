import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { canSetProfileIntake } from "@/lib/readiness/intake";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return fail("unauthorized", 401);
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("invalid_origin", 403);
  if (!checkRateLimit("profile-intake:" + user.id, 20, 60 * 60 * 1000).allowed) return fail("rate_limited", 429);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return fail("invalid_body", 400);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("invalid_body", 400);
    body = parsed as Record<string, unknown>;
  } catch { return fail("invalid_body", 400); }
  if (body.makeDefault !== true) return fail("confirmation_required", 400);
  const admin = getSupabaseAdmin();
  const { data: profile, error } = await admin.from("profiles").select("track, application_year, onboarding_completed_at").eq("id", user.id).maybeSingle();
  if (error) return fail("profile_unavailable", 503);
  if (!profile?.onboarding_completed_at) return fail("onboarding_incomplete", 400);
  if (typeof body.program !== "string" || !canSetProfileIntake(body.program, profile.track, body.year, profile.application_year ?? null)) return fail("invalid_year_or_program", 400);
  if (body.expectedYear !== (profile.application_year ?? null)) return fail("profile_changed", 409);
  let update = admin.from("profiles").update({ application_year: Number(body.year) }).eq("id", user.id).eq("track", profile.track).eq("onboarding_completed_at", profile.onboarding_completed_at);
  update = profile.application_year === null ? update.is("application_year", null) : update.eq("application_year", profile.application_year);
  const { data, error: saveError } = await update.select("application_year").maybeSingle();
  if (saveError) return fail("unable_to_save", 503);
  if (!data) return fail("profile_changed", 409);
  return NextResponse.json({ ok: true, applicationYear: data.application_year });
}
