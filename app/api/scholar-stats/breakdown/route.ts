import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCachedGksBreakdown, type GksTrack } from "@/lib/cached-content";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`scholar-stats-breakdown:${user.id}`, 60, 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const track = searchParams.get("track");
  const university = searchParams.get("university");
  const country = searchParams.get("country");

  if (track !== "gks_g" && track !== "gks_u") {
    return NextResponse.json({ error: "invalid_track" }, { status: 400 });
  }
  if ((!university && !country) || (university && country)) {
    return NextResponse.json({ error: "provide_exactly_one_of_university_or_country" }, { status: 400 });
  }

  try {
    const rows = await getCachedGksBreakdown(track as GksTrack, university, country);
    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
