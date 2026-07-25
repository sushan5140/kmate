import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCachedGksBreakdown, type GksTrack } from "@/lib/cached-content";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`scholar-stats-breakdown:${user.id}`, 60, 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  // Track is derived from the user's own profile, never taken from the
  // request -- a GKS-U applicant should only ever be able to fetch GKS-U
  // breakdown data, not just have it hidden from them in the UI.
  const { data: profile } = await getSupabaseAdmin().from("profiles").select("track").eq("id", user.id).maybeSingle();
  const track = profile?.track as GksTrack | undefined;
  if (track !== "gks_g" && track !== "gks_u") {
    return NextResponse.json({ error: "no_track_on_profile" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const university = searchParams.get("university");
  const country = searchParams.get("country");

  if ((!university && !country) || (university && country)) {
    return NextResponse.json({ error: "provide_exactly_one_of_university_or_country" }, { status: 400 });
  }

  try {
    const rows = await getCachedGksBreakdown(track, university, country);
    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
