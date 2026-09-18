import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { runDailyMaintenance } from "@/lib/automation/daily";

// The one scheduled job. Runs every automation stage in order:
// notice scout -> scholarship discovery -> scholarship freshness ->
// deadline assistant.
//
// Only this route is listed in vercel.json. The individual routes it
// supersedes (/api/cron/notice-scout, /api/cron/scholarships,
// /api/cron/scholarships-freshness, /api/cron/deadline-assistant) all still
// exist and still work for manual or admin-triggered runs -- they are simply
// no longer scheduled, so nothing is fetched twice a day.
//
// Same fail-closed authorization as every other cron route: a CRON_SECRET
// bearer token or the signed-in admin, and with no CRON_SECRET configured the
// bearer path is refused outright.
async function isAuthorized(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  return isAuthorizedAdmin(await getAuthenticatedUser());
}

// Four sequential stages, two of which reach out to external sites. The
// platform default would cut this off well before it finishes.
export const maxDuration = 300;

async function handle(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Vercel Cron presents the bearer; an admin session does not. Recorded
  // separately so a hand-run cannot disguise a scheduler that has stopped.
  const trigger = request.headers.get("authorization") ? "cron" : "manual";

  try {
    const result = await runDailyMaintenance(trigger);
    const failed = result.stages.filter((s) => !s.ok);
    if (failed.length) {
      console.error(
        "[daily-maintenance] stage failures:",
        failed.map((s) => `${s.stage}: ${s.error}`).join(" | ")
      );
    }
    // 207 when the run completed but a stage inside it did not, so a partial
    // failure is distinguishable from a clean run without parsing the body.
    return NextResponse.json(
      { ranAt: new Date().toISOString(), ...result },
      { status: result.ok ? 200 : 207 }
    );
  } catch (e) {
    console.error("[daily-maintenance] run failed:", e);
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
