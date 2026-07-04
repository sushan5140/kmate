import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const track = searchParams.get("track"); // 'gks_u' | 'gks_g'

  let query = getSupabaseAdmin()
    .from("universities")
    .select(
      `
      id, name, city,
      eligibility:university_eligibility!inner ( id, track, category, embassy_type, specialization )
    `
    )
    .order("name")
    .limit(50);

  if (track === "gks_u" || track === "gks_g") {
    query = query.eq("eligibility.track", track);
  }
  if (q) {
    query = query.ilike("name", `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }

  return NextResponse.json({ universities: data ?? [] });
}
