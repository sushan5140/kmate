import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { loadFaqTrends, type Period, type ProgramFilter, type TrackFilter } from "@/lib/gks/faq";
import { FaqTrendsView } from "@/components/gks/faq-trends";

export const metadata: Metadata = {
  title: "FAQ Trends — KMate",
};

interface SearchParams {
  program?: string;
  track?: string;
  period?: string;
  q?: string;
}

const PERIODS: Period[] = ["week", "month", "all"];
const PROGRAMS: ProgramFilter[] = ["all", "UG", "G"];
const TRACKS: TrackFilter[] = ["all", "embassy", "university"];

export default async function FaqTrendsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireOnboarded("/faq-trends");
  const params = await searchParams;

  // Every filter is read from the URL so a filtered view is linkable and the
  // back button behaves, matching how /requests handles its tabs.
  const period = PERIODS.includes(params.period as Period) ? (params.period as Period) : "week";
  const program = PROGRAMS.includes(params.program as ProgramFilter)
    ? (params.program as ProgramFilter)
    : "all";
  const track = TRACKS.includes(params.track as TrackFilter) ? (params.track as TrackFilter) : "all";
  const search = typeof params.q === "string" ? params.q.slice(0, 120) : "";

  const trends = await loadFaqTrends(getSupabaseAdmin(), user.id, { period, program, track, search });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">FAQ Trends</h1>
      <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
        See what GKS applicants ask most often, and save the questions you want to revisit. Opening one asks
        it in the GKS Assistant, so you get the official answer alongside community experience.
      </p>

      <div className="mt-6">
        <FaqTrendsView
          trends={trends}
          filters={{ period, program, track, search }}
        />
      </div>
    </main>
  );
}
