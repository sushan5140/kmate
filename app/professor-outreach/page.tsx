import type { Metadata } from "next";
import Link from "next/link";
import { getReviewerGuest, requireOnboarded } from "@/lib/supabase/auth-server";
import { ProfessorOutreachTracker } from "@/components/outreach/professor-outreach-tracker";

export const metadata: Metadata = { title: "Professor & Lab Outreach — KMate" };

export default async function ProfessorOutreachPage() {
  const user = await requireOnboarded("/professor-outreach");
  const guest = await getReviewerGuest();
  const accountId = guest ? null : user.id;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/application-readiness" className="text-[12px] font-medium text-primary underline underline-offset-2">Application Readiness</Link>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Graduate preparation</p>
      <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-ink">Professor &amp; Lab Outreach Tracker</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
        Keep your research shortlist, contact attempts and follow-up plans together. Verify each lab and department on its official website.
        Professor contact is not universally required; informal support is not admission, nomination or scholarship approval.
      </p>
      <ProfessorOutreachTracker key={accountId ?? "guest"} accountId={accountId} />
    </main>
  );
}
