import type { Metadata } from "next";
import { requireOnboarded, createClient, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getCachedApprovedEcaEntries } from "@/lib/cached-content";
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
  const isAdmin = await isAuthorizedAdmin(user);

  let entries: EcaEntryData[];

  if (isAdmin) {
    // See app/interview-db/page.tsx for why admins are left on the
    // original, uncached, fully-RLS-scoped path (they currently see every
    // submission regardless of status/owner here -- an RLS side-effect,
    // not something worth guessing how to preserve through the cache).
    const { data } = await supabase
      .from("eca_entries")
      .select(
        "id, title, description, track, upvotes_count, downvotes_count, activity_type, impact_area, confidence, source_url, eca_upvotes ( user_id, vote_type )"
      )
      .or(`track.eq.${userTrack},track.eq.both`)
      .order("upvotes_count", { ascending: false });
    entries = ((data ?? []) as unknown as EcaRow[]).map((e) => {
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
  } else {
    const [cachedApproved, { data: ownPendingRows }, { data: myVoteRows }] = await Promise.all([
      getCachedApprovedEcaEntries(),
      supabase
        .from("eca_entries")
        .select("id, title, description, track, upvotes_count, downvotes_count, activity_type, impact_area, confidence, source_url")
        .eq("submitted_by", user.id)
        .neq("status", "approved"),
      supabase.from("eca_upvotes").select("entry_id, vote_type").eq("user_id", user.id),
    ]);

    const myVoteByEntryId = new Map((myVoteRows ?? []).map((v) => [v.entry_id, v.vote_type as "up" | "down"]));

    // Server-side filtered to the viewer's own track (or entries tagged
    // 'both') -- same as before caching, just filtered in-memory over the
    // small cached list instead of in the query.
    const approved: EcaEntryData[] = cachedApproved
      .filter((e) => e.track === userTrack || e.track === "both")
      .map((e) => ({ ...e, voteType: myVoteByEntryId.get(e.id) ?? null }));
    const ownPending: EcaEntryData[] = ((ownPendingRows ?? []) as unknown as EcaRow[]).map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      track: e.track,
      upvotesCount: e.upvotes_count,
      downvotesCount: e.downvotes_count,
      voteType: myVoteByEntryId.get(e.id) ?? null,
      activityType: e.activity_type,
      impactArea: e.impact_area,
      confidence: e.confidence,
      sourceUrl: e.source_url,
    }));
    entries = [...approved, ...ownPending];
  }

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
