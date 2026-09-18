import type { Metadata } from "next";
import { Download, ExternalLink } from "lucide-react";
import { requireOnboarded, createClient } from "@/lib/supabase/auth-server";
import { Card } from "@/components/ui/card";
import { TrackBadge } from "@/components/ui/track-badge";
import { GksURevisionNote } from "@/components/official-guidelines/gks-u-revision-note";
import { GksU2027QuickGuide } from "@/components/official-guidelines/gks-u-2027-quick-guide";
import { OFFICIAL_GUIDELINES, type OfficialGuideline } from "@/lib/official-guidelines";
import { TRACK_LABELS, type Track } from "@/lib/constants";
import { PageHeader } from "@/components/layout/page-header";
import { isDemoUserId } from "@/lib/demo-mode";

export const metadata: Metadata = {
  title: "Official Guidelines — KMate",
};

function GuidelineCard({ guideline }: { guideline: OfficialGuideline }) {
  const isExternal = guideline.url.startsWith("http");
  const isNoticeOnly = guideline.assetType === "notice";
  const downloadHref =
    !isNoticeOnly && isExternal
      ? `/api/official-guidelines/download?id=${guideline.id}`
      : guideline.url;

  return (
    <Card className={guideline.isCurrent ? "border-primary/25 bg-primary-soft/25" : undefined}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <TrackBadge track={guideline.track} />
            {guideline.versionLabel && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                  guideline.isCurrent
                    ? "bg-primary/10 text-primary"
                    : "bg-ink/[0.06] text-muted"
                }`}
              >
                {guideline.versionLabel}
              </span>
            )}
          </div>

          <p className="mt-2 text-[14.5px] font-medium text-ink">{guideline.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{guideline.description}</p>

          {guideline.sourceUrl && guideline.sourceUrl !== guideline.url && (
            <a
              href={guideline.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
            >
              Official NIIED / Study in Korea notice
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {isNoticeOnly && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              The official notice contains the current attachment. KMate intentionally does not cache a direct
              PDF URL here while NIIED is revising the attachment.
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2 sm:flex-col sm:items-stretch">
          <a
            href={guideline.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-white transition-colors hover:bg-ink/90"
          >
            {isNoticeOnly ? "Open official notice" : "View PDF"} <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {!isNoticeOnly && (
            <a
              href={downloadHref}
              download={isExternal ? undefined : guideline.downloadFilename ?? guideline.url.split("/").pop()}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-medium text-ink ring-1 ring-hairline-strong transition-colors hover:bg-canvas"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}

export default async function OfficialGuidelinesPage() {
  const user = await requireOnboarded("/official-guidelines");
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("track").eq("id", user.id).maybeSingle();
  const demoMode = isDemoUserId(user.id);
  const track = (profile?.track as Track | null) ?? "gks_u";
  const guidelines = demoMode ? [...OFFICIAL_GUIDELINES.gks_u, ...OFFICIAL_GUIDELINES.gks_g] : OFFICIAL_GUIDELINES[track];
  const currentGuidelines = guidelines.filter((guideline) => guideline.isCurrent);
  const archivedGuidelines = guidelines.filter((guideline) => !guideline.isCurrent);

  return (
    <main className="workspace-page mx-auto w-full max-w-[1080px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PageHeader eyebrow="Source library" title="Official Guidelines" description={demoMode ? "Browse KMate's full official-source library for both GKS-U and GKS-G directly in the raw workspace." : `Showing the official source material for ${TRACK_LABELS[track]}. Planning tools stay separate so this remains a clean source library.`} meta={<span className="inline-flex rounded-full bg-gold-soft px-2.5 py-1 text-[9.5px] font-extrabold text-gold">Official material · not community-written</span>} />

      {currentGuidelines.length > 0 ? (
        <>
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Current cycle</p>
          </div>
          <div className="mt-2 flex flex-col gap-4">
            {currentGuidelines.map((guideline) => (
              <GuidelineCard key={guideline.id} guideline={guideline} />
            ))}
          </div>
        </>
      ) : (
        <Card className="mt-6 bg-canvas">
          <p className="text-[13px] leading-relaxed text-muted">
            No newer official guideline has been added for this track yet. The latest archived edition is shown below.
          </p>
        </Card>
      )}

      {(track === "gks_u" || demoMode) && <GksU2027QuickGuide />}

      {archivedGuidelines.length > 0 && (
        <section className="mt-10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Previous cycle archive</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              Kept for transparency and comparison. Do not use an archived edition as the active 2027 procedure.
            </p>
          </div>

          <div className="mt-3 flex flex-col gap-4">
            {archivedGuidelines.map((guideline) => (
              <GuidelineCard key={guideline.id} guideline={guideline} />
            ))}
          </div>

          {(track === "gks_u" || demoMode) && <GksURevisionNote />}
        </section>
      )}
    </main>
  );
}
