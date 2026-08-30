import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { saveDailyNote } from "@/lib/youtube/analytics";
import { isDayString } from "@/lib/youtube/day-window";

/**
 * The admin's optional note for one day ("keep links off today").
 *
 * Informational only, and deliberately inert: no posting rule reads this
 * table. A note is a reminder the admin writes to themselves, and treating it
 * as a constraint the server enforces would be worse than not having it --
 * it would look like a safety control while being a free-text field.
 *
 * An empty note deletes the row rather than storing a blank one.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rateLimit = checkRateLimit(`youtube-daily-note:${user.id}`, 60, 5 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: { day?: unknown; note?: unknown };
  try {
    body = (await request.json()) as { day?: unknown; note?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!isDayString(body.day)) return NextResponse.json({ error: "invalid_day" }, { status: 400 });
  if (typeof body.note !== "string") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const saved = await saveDailyNote(body.day, body.note, user.id);
  if (!saved) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ ok: true, day: body.day });
}
