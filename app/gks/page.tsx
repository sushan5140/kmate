import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">GKS Scholarship Assistant</h1>
      <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
        Get an official answer first, then compare community experiences and discussion. Community answers are
        never official rules, so always verify anything that matters against your embassy or university before
        relying on it.
      </p>

      <div className="mt-6">
        <GksAssistant initialQuestion={initialQuestion} initialProgram={initialProgram} />
      </div>
    </main>
  );
}
