import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { runScholarshipFreshness } from "@/lib/scholarships/discovery";

// Job B -- deadline lifecycle, split from discovery now that there is real
// date-dependent state to transition (Phase 2, Part 5). Intended to run
// daily; the sole writer of scholarships.status / is_active.
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
    // `today` override exists only so the lifecycle can be exercised against
    // known dates during verification; it is admin/secret-gated like the rest
    // of the route and never affects a normal unattended run.
    const url = new URL(request.url);
    const asOf = url.searchParams.get("asOf");
    const today = asOf ? new Date(`${asOf}T00:00:00Z`) : new Date();
    if (Number.isNaN(today.getTime())) {
      return NextResponse.json({ error: "invalid_asOf" }, { status: 400 });
    }
    const result = await runScholarshipFreshness(today);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), asOf: today.toISOString().slice(0, 10), result });
  } catch (e) {
    console.error("[scholarships] freshness failed:", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
