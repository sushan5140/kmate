"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  GitCompareArrows,
  Landmark,
  School,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { GuidelineRuleActions } from "@/components/official-guidelines/guideline-rule-actions";
import { GKS_U_2027_SOURCE } from "@/lib/gks/guidelines-2027";
import { GKS_U_2027_POLICY } from "@/lib/gks/gks-u-2027-policy";

type EmbassyPath = "general" | "r_gks";

const ROWS = [
  {
    label: "Where you apply",
    embassy: "Study in Korea online system",
    university: "Directly through the university's own application method",
  },
  {
    label: "2027 application window",
    embassy: GKS_U_2027_POLICY.embassyApplication.display,
    university: GKS_U_2027_POLICY.universityTrackWindow.display + "; exact dates vary by university",
  },
  {
    label: "University choices",
    embassyGeneral: GKS_U_2027_POLICY.choiceRules.general.display,
    embassyRgks: GKS_U_2027_POLICY.choiceRules.r_gks.display,
    university: GKS_U_2027_POLICY.choiceRules.university.display,
  },
  {
    label: "First-round documents",
    embassy: GKS_U_2027_POLICY.documents.embassyFirstRound,
    university: GKS_U_2027_POLICY.documents.universityFirstRound,
  },
  {
    label: "Selection structure",
    embassy: "Embassy → NIIED → selected universities",
    university: "University → NIIED; no third university round",
  },
  {
    label: "If Embassy Round 1 fails",
    embassy: GKS_U_2027_POLICY.fallback.afterEmbassyRound1Fail,
    university: "This is the fallback route permitted after an Embassy first-round failure",
  },
] as const;

export function GksU2027TrackComparator({
  defaultPath,
  defaultMajor,
}: {
  defaultPath: "general" | "r_gks" | null;
  defaultMajor: string;
}) {
  const [embassyPath, setEmbassyPath] = useState<EmbassyPath>(defaultPath ?? "general");

  const choiceRule = useMemo(
    () =>
      embassyPath === "r_gks"
        ? GKS_U_2027_POLICY.choiceRules.r_gks.display
        : GKS_U_2027_POLICY.choiceRules.general.display,
    [embassyPath]
  );

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            Track comparator
          </p>
          <h2 className="mt-1 text-[20px] font-semibold text-ink">
            Embassy Track vs University Track
          </h2>
          <p className="mt-1 max-w-3xl text-[12.75px] leading-relaxed text-muted">
            Compare the structure of the two routes using only the 2027 GKS-U guideline. This does not estimate which route has a better acceptance chance.
          </p>
        </div>

        <div className="flex rounded-full bg-canvas p-1">
          <button
            type="button"
            onClick={() => setEmbassyPath("general")}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium",
              embassyPath === "general" ? "bg-white text-ink shadow-xs" : "text-muted"
            )}
          >
            Embassy General
          </button>
          <button
            type="button"
            onClick={() => setEmbassyPath("r_gks")}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium",
              embassyPath === "r_gks" ? "bg-white text-ink shadow-xs" : "text-muted"
            )}
          >
            Embassy R-GKS
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="border-primary/20 bg-primary-soft/20">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-primary ring-1 ring-hairline">
              <Landmark className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Embassy Track
              </p>
              <p className="mt-1 text-[15px] font-semibold text-ink">
                {embassyPath === "r_gks" ? "R-GKS" : "General"}
              </p>
              {defaultPath && (
                <p className="mt-1 text-[11.5px] text-muted">
                  Prefilled from your KMate profile.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-white/75 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Choice rule</p>
              <p className="mt-1 text-[12.75px] leading-relaxed text-ink">{choiceRule}</p>
            </div>
            <div className="rounded-xl bg-white/75 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Submission</p>
              <p className="mt-1 text-[12.75px] leading-relaxed text-ink">
                Online through Study in Korea during the Embassy application window.
              </p>
            </div>
            <div className="rounded-xl bg-white/75 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Selection rounds</p>
              <p className="mt-1 text-[12.75px] leading-relaxed text-ink">
                Embassy first round → NIIED second round → university third round.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <GuidelineRuleActions
              id={"track-comparator-embassy-" + embassyPath}
              title={embassyPath === "r_gks" ? "Embassy Track — R-GKS" : "Embassy Track — General"}
              text={choiceRule + ". Embassy Track applications are submitted online through Study in Korea and proceed through Embassy, NIIED, then university review."}
              page="pp.6, 9–11"
              sourceUrl={GKS_U_2027_SOURCE.sourceUrl}
              compact
            />
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink">
              <School className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                University Track
              </p>
              <p className="mt-1 text-[15px] font-semibold text-ink">UIC Bachelor's</p>
              {defaultMajor && (
                <p className="mt-1 text-[11.5px] text-muted">
                  Your saved major: {defaultMajor}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-canvas p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Choice rule</p>
              <p className="mt-1 text-[12.75px] leading-relaxed text-ink">
                One university and one department only.
              </p>
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Submission</p>
              <p className="mt-1 text-[12.75px] leading-relaxed text-ink">
                Apply according to the university's own method and schedule.
              </p>
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Selection rounds</p>
              <p className="mt-1 text-[12.75px] leading-relaxed text-ink">
                University first round → NIIED second round. There is no third round.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <GuidelineRuleActions
              id="track-comparator-university"
              title="University Track — UIC Bachelor's"
              text="University Track applicants apply to one university and one department according to the university's own method and schedule. The route proceeds from the university first round to NIIED second round, with no third university round."
              page="pp.6, 9–11"
              sourceUrl={GKS_U_2027_SOURCE.sourceUrl}
              compact
            />
          </div>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <GitCompareArrows className="h-4 w-4 text-primary" />
          <p className="text-[13px] font-semibold text-ink">Side-by-side rules</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Rule</th>
                <th className="px-4 py-2.5 font-semibold">Embassy Track</th>
                <th className="px-4 py-2.5 font-semibold">University Track</th>
              </tr>
            </thead>
            <tbody className="text-[12.5px] leading-relaxed">
              {ROWS.map((row) => (
                <tr key={row.label} className="border-t border-hairline first:border-t-0">
                  <td className="px-4 py-3 font-medium text-ink">{row.label}</td>
                  <td className="px-4 py-3 text-muted">
                    {"embassyGeneral" in row
                      ? embassyPath === "r_gks"
                        ? row.embassyRgks
                        : row.embassyGeneral
                      : row.embassy}
                  </td>
                  <td className="px-4 py-3 text-muted">{row.university}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-success/10 px-3.5 py-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-[12.5px] leading-relaxed text-ink">
              If you fail the Embassy first round, the 2027 guideline permits you to apply through University Track, provided the university's deadline is still open.
            </p>
          </div>
          <div className="mt-2.5 pl-6">
            <GuidelineRuleActions
              id="fallback-after-embassy-fail"
              title="Embassy first-round fallback"
              text="If an applicant fails the Embassy Track first round, they may apply through University Track if the university's application deadline is still open."
              page="pp.9–11"
              sourceUrl={GKS_U_2027_SOURCE.sourceUrl}
              compact
            />
          </div>
        </div>
        <div className="rounded-xl bg-gold/10 px-3.5 py-3">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <p className="text-[12.5px] leading-relaxed text-ink">
              If you pass the Embassy first round, including as a backup candidate, you cannot apply again through University Track.
            </p>
          </div>
          <div className="mt-2.5 pl-6">
            <GuidelineRuleActions
              id="no-fallback-after-embassy-pass"
              title="No University Track after Embassy Round 1 pass"
              text="Embassy Track applicants who pass the first round, including backup candidates, cannot apply again through University Track."
              page="p.9"
              sourceUrl={GKS_U_2027_SOURCE.sourceUrl}
              compact
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/official-guidelines"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[12px] font-medium text-ink ring-1 ring-hairline-strong"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Review 2027 guideline
        </Link>
        <Link
          href="/application-readiness"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[12px] font-medium text-white"
        >
          Use this route in readiness <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
