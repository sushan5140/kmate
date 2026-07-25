import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { Card } from "@/components/ui/card";
import { MockInterviewApp } from "@/components/mock-interview/mock-interview-app";

export const metadata: Metadata = {
  title: "AI Mock Interview — KMate",
};

// Widened from KMate's usual max-w-3xl: the interview stage's two-column
// video + live-metrics layout needs ~1160px, matching the prototype's
// wider "interview-card" override.
export default async function MockInterviewPage() {
  await requireOnboarded("/interview-db/mock-interview");

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/interview-db" className="text-[13px] text-muted hover:text-ink">
        ← Interview DB
      </Link>
      <h1 className="mt-2 text-[22px] font-semibold text-ink">AI Mock Interview</h1>

      <Card className="mt-4">
        <p className="text-[13.5px] leading-relaxed text-muted">
          Practice with your camera and mic on. On-device tracking (no video ever leaves your
          browser) measures delivery mechanics -- eye contact, pace, filler words, pauses, and
          posture -- across a short set of questions. At the end, one feedback pass comments only
          on how you delivered your answers, never on what you said. You&apos;ll need your own
          free Gemini API key to run the feedback step.
        </p>
      </Card>

      <MockInterviewApp />
    </main>
  );
}
