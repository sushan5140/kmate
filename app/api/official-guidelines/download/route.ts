import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { OFFICIAL_GUIDELINES } from "@/lib/official-guidelines";
import { TRACKS, type Track } from "@/lib/constants";

// The source PDFs are served by NIIED's own host without a
// Content-Disposition header, and the `download` attribute on a plain <a>
// is ignored by browsers for cross-origin URLs -- so a direct link would
// just navigate/preview the PDF instead of downloading it. Proxying and
// re-serving with our own Content-Disposition is what actually forces the
// download, same technique /api/questions/download uses for its
// server-generated PDF.
export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`download-official-guidelines:${user.id}`, 10, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const track = searchParams.get("track") as Track | null;
  if (!track || !TRACKS.includes(track)) {
    return NextResponse.json({ error: "invalid_track" }, { status: 400 });
  }

  const guideline = OFFICIAL_GUIDELINES[track];
  const upstream = await fetch(guideline.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }

  const filename = guideline.url.split("/").pop() ?? `${track}-guidelines.pdf`;

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
