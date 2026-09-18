import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { runDeadlineAssistant } from "@/lib/assistant/run";
import { recordRun } from "@/lib/automation/health";

// Runs the Deadline Verification Assistant over approved notices.
//
// Same fail-closed posture as every other cron route: a CRON_SECRET bearer
// token or the signed-in admin, and with no CRON_SECRET configured the bearer
// path is refused outright rather than allowing unauthenticated runs.
//
// Takes no parameters of any kind. It reads only rows a reviewer has already
// approved, so a caller cannot steer it at a notice of their choosing.
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

  // Vercel Cron sends its own bearer; anything else reaching here with an
  // admin session is a hand-run, and the two are recorded differently so a
  // manual trigger cannot disguise a scheduler that has stopped firing.
  const trigger = request.headers.get("authorization") ? "cron" : "manual";

  const { result, error } = await recordRun("deadline-assistant", trigger, runDeadlineAssistant);

  if (error) {
    console.error("[deadline-assistant] run failed:", error);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
  const degraded = (result?.errors.length ?? 0) > 0;
  return NextResponse.json({ ok: !degraded, ranAt: new Date().toISOString(), ...result }, { status: degraded ? 207 : 200 });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
