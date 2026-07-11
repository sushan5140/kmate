import type { Metadata } from "next";
import { requireOnboarded, createClient } from "@/lib/supabase/auth-server";
import { EcaList, type EcaEntryData } from "@/components/eca/eca-list";
import { SubmitEcaForm } from "@/components/eca/submit-eca-form";
import { Card } from "@/components/ui/card";
import type { EcaTrack, EcaActivityType, EcaImpactArea, Confidence } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Extracurriculars — KMate",
};

interface EcaRow {
  id: string;
  title: string;
  description: string | null;
  track: EcaTrack;
  upvotes_count: number;
  activity_type: EcaActivityType | null;
  impact_area: EcaImpactArea | null;
  confidence: Confidence | null;
  source_url: string | null;
  eca_upvotes: { user_id: string }[];
}

export default async function EcaPage() {
  const user = await requireOnboarded("/eca");
  const supabase = await createClient();

  const { data } = await supabase
    .from("eca_entries")
    .select(
      "id, title, description, track, upvotes_count, activity_type, impact_area, confidence, source_url, eca_upvotes ( user_id )"
    )
    .order("upvotes_count", { ascending: false });

  const entries: EcaEntryData[] = ((data ?? []) as unknown as EcaRow[]).map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    track: e.track,
    upvotesCount: e.upvotes_count,
    upvotedByMe: e.eca_upvotes.some((u) => u.user_id === user.id),
    activityType: e.activity_type,
    impactArea: e.impact_area,
    confidence: e.confidence,
    sourceUrl: e.source_url,
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Extracurriculars</h1>

      <Card className="mt-4">
        <p className="text-[13.5px] leading-relaxed text-muted">
          Crowdsourced extracurriculars and experiences applicants believe help a GKS application --
          ranked by upvotes, filterable by track since what matters differs between GKS-U and GKS-G.
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
