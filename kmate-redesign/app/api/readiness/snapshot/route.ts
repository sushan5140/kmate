import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildCheckerOptions } from "@/lib/requirements/options";
import { getApplicationWorkspace } from "@/lib/readiness";

/**
 * The readiness document rules for one application configuration, statuses
 * only -- no progress.
 *
 * The dashboard needs to summarise an application the server cannot see: which
 * application is saved lives in the browser's localStorage, and so does the
 * document progress. The rules themselves come from a 338 KB dataset that must
 * stay on the server. This route is the seam between the two: the client sends
 * the configuration it has saved and gets back what that configuration
 * requires, then overlays its own stored progress locally.
 *
 * Deliberately no second query format: the parameters are exactly the ones
 * /application-readiness already puts in its URL, so a saved application links
 * to both with the same encoding.
 */

export const dynamic = "force-dynamic";

const asArray = (v: string[] | undefined): string[] => v ?? [];

export async function GET(request: Request) {
  // The site-wide proxy already requires a session for this path; re-checking
  // here is the same defence-in-depth the other API routes use.
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`readiness-snapshot:${user.id}`, 60, 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const params = new URL(request.url).searchParams;
  const options = buildCheckerOptions();

  // Every value is validated against the Requirement Checker's own option tree,
  // exactly as the readiness page does, so a hand-edited request cannot ask for
  // a track or university that does not exist.
  const program = options.programs.some((p) => p.value === params.get("program")) ? params.get("program")! : "";
  if (!program) return NextResponse.json({ error: "unknown_program" }, { status: 400 });

  const track =
    (options.tracks[program] ?? []).some((t) => t.value === params.get("track")) ? params.get("track")! : "";
  const trackOption = (options.tracks[program] ?? []).find((t) => t.value === track);
  const subtype = (trackOption?.subtypes ?? []).some((s) => s.value === params.get("subtype"))
    ? params.get("subtype")!
    : "";

  const pool = subtype
    ? options.universities[`${program}|${track}|${subtype}`] ?? []
    : options.universities[`${program}|${track}`] ?? [];

  const names = asArray(params.getAll("uni"));
  const majors = asArray(params.getAll("maj"));

  // A saved university the checker no longer offers on this route is reported
  // rather than dropped: the dashboard says its verified data is unavailable
  // instead of silently removing a university the applicant chose.
  const usable: { name: string; major: string }[] = [];
  const unavailable: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (!name || usable.some((u) => u.name === name)) continue;
    if (track && pool.includes(name)) usable.push({ name, major: (majors[i] ?? "").slice(0, 120) });
    else unavailable.push(name);
  }

  const workspace = getApplicationWorkspace({
    program: program as "GKS-U" | "GKS-G",
    ...(track ? { track } : {}),
    ...(subtype ? { subtype } : {}),
    universities: usable,
  });

  // Only what the dashboard renders: an id to match stored progress against, a
  // label for the missing-items list, and the status. Notes, conditions and
  // sources stay on the readiness page itself.
  const slim = (items: { id: string; label: string; status: string }[]) =>
    items.map((i) => ({ id: i.id, label: i.label, status: i.status }));

  return NextResponse.json({
    program,
    track,
    subtype,
    common: slim(workspace.common),
    universities: workspace.universities.map((u) => ({
      name: u.university,
      major: u.major,
      items: slim(u.items),
    })),
    unavailable,
  });
}
