import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bookmark } from "lucide-react";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { SavedGksRulesList } from "@/components/official-guidelines/saved-gks-rules-list";

export const metadata: Metadata = {
  title: "Saved GKS Rules — KMate",
};

export default async function SavedGksRulesPage() {
  await requireOnboarded("/gks/saved");

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link
        href="/gks"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to GKS Assistant
      </Link>

      <div className="mt-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Bookmark className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            Saved GKS Rules
          </p>
          <h1 className="mt-1 text-[22px] font-semibold text-ink">
            Bookmarked official rules and guideline-grounded AI answers
          </h1>
          <p className="mt-1 max-w-2xl text-[12.75px] leading-relaxed text-muted">
            Saved items sync with your KMate account across signed-in devices, with a browser cache for resilience. They are a personal reference list, not a replacement for the current official guideline.
          </p>
        </div>
      </div>

      <SavedGksRulesList />
    </main>
  );
}
