import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { runNoticeScout, formatScoutSummary } from "@/lib/notices/scout";

// Triggers the official-notice scout: refresh the Study in Korea index, then
// queue anything unseen for review.
//
// Same authorization posture as /api/cron/notices, deliberately -- this route
// also reaches out to an external government site, so it is never public:
//   1. Vercel Cron / manual curl -- Authorization: Bearer $CRON_SECRET
//   2. The signed-in admin -- same isAuthorizedAdmin gate as every /admin route
//
// Fails closed: with no CRON_SECRET configured the bearer path is refused
// outright rather than silently allowing unauthenticated runs.
//
// There is no URL parameter of any kind. A caller cannot ask this route to
// fetch an address of their choosing -- the only pages it will ever retrieve
// are the ones registered in public.sources, and every stored notice is
// re-checked against that source's official_domain. That is what keeps
// arbitrary-URL fetching off the client entirely.
async function isAuthorized(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  return isAuthorizedAdmin(await getAuthenticatedUser());
}

async function handle(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runNoticeScout();
    console.log(`[notice-scout] ${formatScoutSummary(result)}`);

    // 207 when the run completed but something inside it did not. The caller
    // gets the counts either way rather than an opaque failure.
    const degraded = result.errors.length > 0 || result.parseFailures.length > 0;
    return NextResponse.json({ ok: !degraded, ...result }, { status: degraded ? 207 : 200 });
  } catch (e) {
    console.error("[notice-scout] run failed:", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

/** Vercel Cron issues GET. */
export async function GET(request: Request) {
  return handle(request);
}

/** POST for manual triggering from the admin review page. */
export async function POST(request: Request) {
  return handle(request);
}
