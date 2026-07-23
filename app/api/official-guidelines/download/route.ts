import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { OFFICIAL_GUIDELINES } from "@/lib/official-guidelines";

// Only used for entries whose url is an external link (currently just
// GKS-G) -- NIIED's server sends no Content-Disposition, and the
// `download` attribute is ignored by browsers for cross-origin URLs, so a
// direct link would just navigate/preview the PDF instead of downloading
// it. Proxying and re-serving with our own Content-Disposition is what
// actually forces the download, same technique /api/questions/download
// uses for its server-generated PDF. Same-origin /public entries (GKS-U)
// skip this route entirely and use a plain `download` link instead.
export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`download-official-guidelines:${user.id}`, 10, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const guideline = Object.values(OFFICIAL_GUIDELINES)
    .flat()
    .find((g) => g.id === id);
  if (!guideline) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  if (!guideline.url.startsWith("http")) {
    return NextResponse.json({ error: "not_a_remote_file" }, { status: 400 });
  }

  const upstream = await fetch(guideline.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }

  const filename = guideline.url.split("/").pop() ?? `${guideline.id}.pdf`;

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
