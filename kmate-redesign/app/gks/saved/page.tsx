import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bookmark } from "lucide-react";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { SavedGksRulesList } from "@/components/official-guidelines/saved-gks-rules-list";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Saved GKS Rules — KMate",
};

export default async function SavedGksRulesPage() {
  await requireOnboarded("/gks/saved");

  return (
    <main className="workspace-page mx-auto w-full max-w-[1040px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link
        href="/gks"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to GKS Assistant
      </Link>

      <PageHeader eyebrow="Personal reference" title="Saved GKS Rules" description="Bookmarked official rules and guideline-grounded AI answers. Browser storage keeps this useful even in the account-free workspace." meta={<span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[9.5px] font-extrabold text-primary"><Bookmark className="h-3 w-3" /> Saved library</span>} />

      <SavedGksRulesList />
    </main>
  );
}
