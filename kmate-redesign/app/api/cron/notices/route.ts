import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { runDiscovery } from "@/lib/notices/discovery";

// This route reaches out to an external government site on every call, so it
// is never open to the public. Two ways in, both explicit:
//   1. Vercel Cron / manual curl -- Authorization: Bearer $CRON_SECRET
//   2. The signed-in admin (same isAuthorizedAdmin gate as every /admin route)
//
// Fails closed: with no CRON_SECRET configured, the bearer path is refused
// outright rather than silently allowing unauthenticated runs.
//
// NOTE: /api/cron is listed in proxy.ts's PUBLIC_PATHS so an unauthenticated
// cron request isn't redirected to /login before it arrives. The
// authorization below -- not the proxy -- is what actually guards it.
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
    const results = await runDiscovery();
    const failed = results.some((r) => r.errors.length > 0);
    return NextResponse.json({ ok: !failed, ranAt: new Date().toISOString(), results }, { status: failed ? 207 : 200 });
  } catch (e) {
    console.error("[notices] discovery run failed:", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

/** Vercel Cron issues GET. */
export async function GET(request: Request) {
  return handle(request);
}

/** POST for manual triggering. */
export async function POST(request: Request) {
  return handle(request);
}
