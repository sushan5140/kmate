import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getCachedUniversitySearch } from "@/lib/cached-content";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  // This route doesn't check auth itself (the data is non-sensitive,
  // near-static reference data), but proxy.ts's site-wide middleware
  // already requires a session for every non-public path including this
  // one -- so a real user id is always available here in practice. Re-check
  // it directly rather than trusting that upstream gate alone, same
  // defense-in-depth reasoning already used elsewhere (e.g. the admin
  // moderate routes).
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`universities-search:${user.id}`, 30, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const track = searchParams.get("track"); // 'gks_u' | 'gks_g'

  try {
    const universities = await getCachedUniversitySearch(track, q);
    return NextResponse.json({ universities });
  } catch {
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }
}
