import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch, Presentation, ShieldCheck } from "lucide-react";
import { ResearchInterviewApp } from "@/components/research-interview/research-interview-app";
import { Card } from "@/components/ui/card";
import { requireOnboarded } from "@/lib/supabase/auth-server";

export const metadata: Metadata = {
  title: "Research Interview — KMate",
};

export default async function ResearchInterviewPage() {
  await requireOnboarded("/interview-db/research-interview");

  return (
    <main className="mx-auto max-w-[1480px] px-5 py-8 sm:px-6 lg:px-8">
      <Link href="/interview-db" className="text-[13px] text-muted hover:text-ink">
        ← Interview DB
      </Link>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Professor Mode</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-ink">Research Interview</h1>
          <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-muted">
            Defend a paper while presenting your own slides. Questions adapt after every answer, and the paper remains the source of truth throughout the interview.
          </p>
        </div>
      </div>

      <Card className="mt-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <FileSearch className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-ink">Paper grounded</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">PDF evidence drives evaluation, missed points, contradictions, and follow-ups.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <Presentation className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-ink">Presentation stays yours</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">Move forward, back, or jump to any slide. KMate never auto-advances it.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-ink">Observable delivery only</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">Camera-facing tendency, pace, fillers, pauses, posture stability, and speech capture — no emotion or personality claims.</p>
            </div>
          </div>
        </div>
      </Card>

      <ResearchInterviewApp />
    </main>
  );
}
