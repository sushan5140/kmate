import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { runScholarshipDiscovery } from "@/lib/scholarships/discovery";

// Job A -- scholarship discovery. Same authorization posture as Phase 1's
// notice cron: CRON_SECRET bearer token or the signed-in admin, fails closed.
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
    const results = await runScholarshipDiscovery();
    const failed = results.some((r) => r.errors.length > 0);
    return NextResponse.json({ ok: !failed, ranAt: new Date().toISOString(), results }, { status: failed ? 207 : 200 });
  } catch (e) {
    console.error("[scholarships] discovery failed:", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
