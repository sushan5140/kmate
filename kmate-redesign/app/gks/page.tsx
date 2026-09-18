import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { GksAssistant } from "@/components/gks/gks-assistant";

export const metadata: Metadata = {
  title: "GKS Scholarship Assistant — KMate",
};

export default async function GksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; program?: string }>;
}) {
  await requireOnboarded("/gks");

  // Opening a question from FAQ Trends lands here with it prefilled. Both
  // values are validated: `program` must be one of the two the API accepts,
  // and the question is length-capped exactly as the textarea caps it.
  const params = await searchParams;
  const initialQuestion = typeof params.q === "string" ? params.q.slice(0, 2000) : "";
  const initialProgram = params.program === "UG" || params.program === "G" ? params.program : null;

  return (
    <main className="workspace-page mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PageHeader eyebrow="Official-source assistant" title="GKS Assistant" description="Ask a rule question and trace the answer back to official guideline evidence. Community anecdotes stay outside the model's rule layer." meta={<span className="inline-flex rounded-full bg-surface px-2.5 py-1 text-[9.5px] font-extrabold text-muted ring-1 ring-hairline">GKS-U 2027 · GKS-G guideline retrieval</span>} actions={<Link href="/gks/saved" className="pressable inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-ink px-4 text-[11px] font-extrabold text-white shadow-xs"><Bookmark className="h-3.5 w-3.5" />Saved rules</Link>} />

      <div className="mt-6">
        <GksAssistant initialQuestion={initialQuestion} initialProgram={initialProgram} />
      </div>
    </main>
  );
}
