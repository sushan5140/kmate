import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { Card } from "@/components/ui/card";
import { MockInterviewApp } from "@/components/mock-interview/mock-interview-app";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "AI Mock Interview — KMate",
};

// Widened from KMate's usual max-w-3xl: the interview stage's two-column
// video + live-metrics layout needs ~1160px, matching the prototype's
// wider "interview-card" override.
export default async function MockInterviewPage() {
  await requireOnboarded("/interview-db/mock-interview");

  return (
    <main className="workspace-page mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link href="/interview-db" className="mb-4 inline-flex text-[10.5px] font-extrabold text-muted hover:text-ink">← Back to Interview Studio</Link>
      <PageHeader eyebrow="Live rehearsal" title="AI Mock Interview" description="Practice with camera and microphone feedback on delivery mechanics: eye contact, pace, fillers, pauses, and posture. Video processing stays on-device." meta={<span className="inline-flex rounded-full bg-primary-soft px-2.5 py-1 text-[9.5px] font-extrabold text-primary">Camera + mic · BYOK feedback</span>} />

      <MockInterviewApp />
    </main>
  );
}
