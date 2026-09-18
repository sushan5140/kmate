import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { OFFICIAL_GUIDELINES } from "@/lib/official-guidelines";

// Remote guideline PDFs are proxied so KMate can return a reliable
// Content-Disposition header. Same-origin /public PDFs skip this route and
// use the browser's native download behavior.
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
  if (guideline.assetType === "notice") {
    return NextResponse.json(
      { error: "current_attachment_available_on_official_notice", source_url: guideline.sourceUrl ?? guideline.url },
      { status: 409 }
    );
  }
  if (!guideline.url.startsWith("http")) {
    return NextResponse.json({ error: "not_a_remote_file" }, { status: 400 });
  }

  const upstream = await fetch(guideline.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("pdf")) {
    return NextResponse.json({ error: "upstream_not_pdf" }, { status: 502 });
  }

  const filename =
    guideline.downloadFilename ??
    (guideline.url.split("/").pop()?.endsWith(".pdf")
      ? guideline.url.split("/").pop()
      : `${guideline.id}.pdf`);

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
