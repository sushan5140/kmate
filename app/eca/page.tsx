import type { Metadata } from "next";
import { requireOnboarded, createClient } from "@/lib/supabase/auth-server";
import { EcaList, type EcaEntryData } from "@/components/eca/eca-list";
import { SubmitEcaForm } from "@/components/eca/submit-eca-form";
import { Card } from "@/components/ui/card";
import { ECA_TRACK_LABELS, type EcaTrack, type EcaActivityType, type EcaImpactArea, type Confidence } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Extracurriculars — KMate",
};

interface EcaRow {
  id: string;
  title: string;
  description: string | null;
  track: EcaTrack;
  upvotes_count: number;
  downvotes_count: number;
  activity_type: EcaActivityType | null;
  impact_area: EcaImpactArea | null;
  confidence: Confidence | null;
  source_url: string | null;
  eca_upvotes: { user_id: string; vote_type: "up" | "down" }[];
}

export default async function EcaPage() {
  const user = await requireOnboarded("/eca");
  const supabase = await createClient();

  // The entries query's filter depends on the resolved track, so these
  // can't be parallelized -- a genuine dependency, not the redundant kind of
  // sequential await worth merging.
  const { data: profile } = await supabase.from("profiles").select("track").eq("id", user.id).maybeSingle();
  const userTrack = (profile?.track as EcaTrack | null) ?? "gks_u";

  // Server-side filtered to the viewer's own track (or entries tagged
  // 'both') -- a GKS-G user's response never includes GKS-U-only rows in
  // the first place, rather than fetching everything and hiding some
  // client-side.
  const { data } = await supabase
    .from("eca_entries")
    .select(
      "id, title, description, track, upvotes_count, downvotes_count, activity_type, impact_area, confidence, source_url, eca_upvotes ( user_id, vote_type )"
    )
    .or(`track.eq.${userTrack},track.eq.both`)
    .order("upvotes_count", { ascending: false });

  const entries: EcaEntryData[] = ((data ?? []) as unknown as EcaRow[]).map((e) => {
    const myVote = e.eca_upvotes.find((u) => u.user_id === user.id);
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      track: e.track,
      upvotesCount: e.upvotes_count,
      downvotesCount: e.downvotes_count,
      voteType: myVote?.vote_type ?? null,
      activityType: e.activity_type,
      impactArea: e.impact_area,
      confidence: e.confidence,
      sourceUrl: e.source_url,
    };
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Extracurriculars</h1>

      <Card className="mt-4">
        <p className="text-[13.5px] leading-relaxed text-muted">
          Crowdsourced extracurriculars and experiences applicants believe help a GKS application.
          Showing results for {ECA_TRACK_LABELS[userTrack]}, based on your profile.
        </p>
      </Card>

      <div className="mt-6 flex justify-end">
        <SubmitEcaForm />
      </div>

      <div className="mt-6">
        <EcaList entries={entries} />
      </div>
    </main>
  );
}
