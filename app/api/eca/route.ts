import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { ECA_TRACKS } from "@/lib/constants";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title, description, track } = (await request.json()) as { title: string; description?: string; track: string };
  if (!title || typeof title !== "string" || title.trim().length < 4 || title.length > 120) {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }
  if (description && (typeof description !== "string" || description.length > 500)) {
    return NextResponse.json({ error: "invalid_description" }, { status: 400 });
  }
  if (!ECA_TRACKS.includes(track as (typeof ECA_TRACKS)[number])) {
    return NextResponse.json({ error: "invalid_track" }, { status: 400 });
  }

  const rateLimit = checkRateLimit(`submit-eca:${user.id}`, 5, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { error } = await getSupabaseAdmin()
    .from("eca_entries")
    .insert({ title: title.trim(), description: description?.trim() || null, track, submitted_by: user.id, status: "pending" });

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
