import type { Metadata } from "next";
import { requireOnboarded, createClient, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getCachedApprovedMistakeEntries } from "@/lib/cached-content";
import { MistakesList, type MistakeEntryData } from "@/components/mistakes/mistakes-list";
import { SubmitMistakeForm } from "@/components/mistakes/submit-mistake-form";
import { Card } from "@/components/ui/card";
import type { MistakeDocumentType, MistakeReasonCategory, Confidence } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Application Mistakes — KMate",
};

interface MistakeRow {
  id: string;
  title: string;
  description: string | null;
  document_type: MistakeDocumentType;
  reason_category: MistakeReasonCategory;
  upvotes_count: number;
  downvotes_count: number;
  confidence: Confidence | null;
  source_url: string | null;
  mistake_upvotes: { user_id: string; vote_type: "up" | "down" }[];
}

export default async function MistakesPage() {
  const user = await requireOnboarded("/mistakes");
  const supabase = await createClient();

  const isAdmin = await isAuthorizedAdmin(user);

  let entries: MistakeEntryData[];

  if (isAdmin) {
    // See app/interview-db/page.tsx for why admins are left on the
    // original, uncached, fully-RLS-scoped path.
    const { data } = await supabase
      .from("mistake_entries")
      .select(
        "id, title, description, document_type, reason_category, upvotes_count, downvotes_count, confidence, source_url, mistake_upvotes ( user_id, vote_type )"
      )
      .order("upvotes_count", { ascending: false });
    entries = ((data ?? []) as unknown as MistakeRow[]).map((e) => {
      const myVote = e.mistake_upvotes.find((u) => u.user_id === user.id);
      return {
        id: e.id,
        title: e.title,
        description: e.description,
        documentType: e.document_type,
        reasonCategory: e.reason_category,
        upvotesCount: e.upvotes_count,
        downvotesCount: e.downvotes_count,
        voteType: myVote?.vote_type ?? null,
        confidence: e.confidence,
        sourceUrl: e.source_url,
      };
    });
  } else {
    const [cachedApproved, { data: ownPendingRows }, { data: myVoteRows }] = await Promise.all([
      getCachedApprovedMistakeEntries(),
      supabase
        .from("mistake_entries")
        .select("id, title, description, document_type, reason_category, upvotes_count, downvotes_count, confidence, source_url")
        .eq("submitted_by", user.id)
        .neq("status", "approved"),
      supabase.from("mistake_upvotes").select("entry_id, vote_type").eq("user_id", user.id),
    ]);

    const myVoteByEntryId = new Map((myVoteRows ?? []).map((v) => [v.entry_id, v.vote_type as "up" | "down"]));

    const approved: MistakeEntryData[] = cachedApproved.map((e) => ({ ...e, voteType: myVoteByEntryId.get(e.id) ?? null }));
    const ownPending: MistakeEntryData[] = ((ownPendingRows ?? []) as unknown as MistakeRow[]).map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      documentType: e.document_type,
      reasonCategory: e.reason_category,
      upvotesCount: e.upvotes_count,
      downvotesCount: e.downvotes_count,
      voteType: myVoteByEntryId.get(e.id) ?? null,
      confidence: e.confidence,
      sourceUrl: e.source_url,
    }));
    entries = [...approved, ...ownPending];
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Application Mistakes</h1>

      <Card className="mt-4">
        <p className="text-[13.5px] leading-relaxed text-muted">
          Crowdsourced mistakes and rejection reasons from past applicants -- searchable by document
          type or by what went wrong, so you can check the specific document or stage you&apos;re worried about.
        </p>
      </Card>

      <div className="mt-6 flex justify-end">
        <SubmitMistakeForm />
      </div>

      <div className="mt-6">
        <MistakesList entries={entries} />
      </div>
    </main>
  );
}
