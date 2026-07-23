import type { Metadata } from "next";
import { Download, ExternalLink } from "lucide-react";
import { requireOnboarded, createClient } from "@/lib/supabase/auth-server";
import { Card } from "@/components/ui/card";
import { TrackBadge } from "@/components/ui/track-badge";
import { GksURevisionNote } from "@/components/official-guidelines/gks-u-revision-note";
import { OFFICIAL_GUIDELINES, type OfficialGuideline } from "@/lib/official-guidelines";
import { TRACK_LABELS, type Track } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Official Guidelines — KMate",
};

function GuidelineCard({ guideline }: { guideline: OfficialGuideline }) {
  // Local /public PDFs are same-origin, so the `download` attribute works
  // natively; the external GKS-G link needs the download-proxy route,
  // since NIIED's own server sends no Content-Disposition and browsers
  // ignore `download` cross-origin.
  const isExternal = guideline.url.startsWith("http");
  const downloadHref = isExternal ? `/api/official-guidelines/download?id=${guideline.id}` : guideline.url;

  return (
    <Card className="flex items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <TrackBadge track={guideline.track} />
          {guideline.versionLabel && (
            <span className="inline-flex items-center rounded-full bg-ink/[0.06] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {guideline.versionLabel}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[14.5px] font-medium text-ink">{guideline.title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{guideline.description}</p>
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-2">
        <a
          href={guideline.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-white transition-colors hover:bg-ink/90"
        >
          View <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <a
          href={downloadHref}
          download={isExternal ? undefined : guideline.url.split("/").pop()}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-medium text-ink ring-1 ring-hairline-strong transition-colors hover:bg-canvas"
        >
          <Download className="h-3.5 w-3.5" /> Download
        </a>
      </div>
    </Card>
  );
}

export default async function OfficialGuidelinesPage() {
  const user = await requireOnboarded("/official-guidelines");
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("track").eq("id", user.id).maybeSingle();
  const track = (profile?.track as Track | null) ?? "gks_u";
  const guidelines = OFFICIAL_GUIDELINES[track];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Official Guidelines</h1>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gold">
        Official NIIED content — not community-written
      </p>

      <Card className="mt-4">
        <p className="text-[13.5px] leading-relaxed text-muted">
          Showing the guidelines for {TRACK_LABELS[track]}, based on your profile.
        </p>
      </Card>

      <div className="mt-6 flex flex-col gap-4">
        {guidelines.map((guideline) => (
          <GuidelineCard key={guideline.id} guideline={guideline} />
        ))}
      </div>

      {track === "gks_u" && <GksURevisionNote />}
    </main>
  );
}
