import type { Metadata } from "next";
import { requireOnboarded, createClient } from "@/lib/supabase/auth-server";
import { TimelineChecklist, type TimelineItemData } from "@/components/timeline/timeline-checklist";
import { DeadlineBanner } from "@/components/timeline/deadline-banner";
import { Card } from "@/components/ui/card";
import { estimateApplicationDeadline } from "@/lib/timeline/deadline";
import type { Track } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Timeline — KMate",
};

export default async function TimelinePage() {
  const user = await requireOnboarded("/timeline");
  const supabase = await createClient();

  const [{ data: profile }, { data: templateItems }, { data: progressRows }] = await Promise.all([
    supabase.from("profiles").select("track, application_year").eq("id", user.id).maybeSingle(),
    supabase
      .from("timeline_templates")
      .select("id, item_label, item_description, typical_deadline_offset_days")
      .is("route", null)
      .is("country", null)
      .order("sort_order", { ascending: true }),
    supabase.from("user_timeline_progress").select("timeline_template_item_id, completed").eq("user_id", user.id),
  ]);

  const completedIds = new Set((progressRows ?? []).filter((p) => p.completed).map((p) => p.timeline_template_item_id));
  const track = (profile?.track as Track | null) ?? null;

  // True once the estimated deadline for the user's stored (track,
  // application_year) is already in the past -- a nudge to update their
  // profile, separate from the calendar banner below (which always shows
  // the upcoming cycle's dates for the track, not tied to which year the
  // user personally has saved).
  let cycleClosed = false;
  if (track && profile?.application_year) {
    const deadline = estimateApplicationDeadline(track, profile.application_year);
    cycleClosed = deadline.getTime() < new Date().getTime();
  }

  const items: TimelineItemData[] = (templateItems ?? []).map((t) => ({
    id: t.id,
    label: t.item_label,
    description: t.item_description,
    offsetDays: t.typical_deadline_offset_days,
    completed: completedIds.has(t.id),
  }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Applicant Timeline</h1>

      {track && <DeadlineBanner track={track} />}

      {cycleClosed && (
        <Card className="mt-4 bg-gold/5 ring-gold/30">
          <p className="text-[13.5px] font-medium text-ink">
            Your saved application year&apos;s deadline has passed -- update your application year in your profile.
          </p>
        </Card>
      )}

      <Card className="mt-4">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Prep checklist</p>
        <h2 className="mt-1 text-[16px] font-semibold text-ink">What to prepare, and roughly when</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          A general starting checklist for GKS applications. Exact requirements (like apostille rules) vary
          by country -- treat the timing below as a rough guide, not an official deadline.
        </p>
      </Card>

      <div className="mt-6">
        <TimelineChecklist items={items} />
      </div>
    </main>
  );
}
