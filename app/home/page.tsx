import type { Metadata } from "next";
import Link from "next/link";
import { Users, MessageSquare, AlertTriangle, Award, Inbox, UserRound, ArrowDown } from "lucide-react";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { Card, MicroLabel } from "@/components/ui/card";
import { TrackBadge } from "@/components/ui/track-badge";
import { estimateApplicationDeadline, computeStartByDate } from "@/lib/timeline/deadline";
import type { Track } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Home — KMate",
};

export default async function HomePage() {
  const user = await requireOnboarded("/home");
  const admin = getSupabaseAdmin();

  const { data: profile } = await admin
    .from("profiles")
    .select("username, track, major, application_year")
    .eq("id", user.id)
    .maybeSingle();

  const track = (profile?.track as Track) ?? null;

  const [
    { data: ownUniversityChoices },
    { data: templateItems },
    { data: progressRows },
    { data: draftRows },
    { count: totalApprovedQuestions },
    { data: topMistake },
    { count: pendingRequestsCount },
  ] = await Promise.all([
    admin.from("university_choices").select("university_id").eq("user_id", user.id),
    admin
      .from("timeline_templates")
      .select("id, item_label, typical_deadline_offset_days")
      .is("route", null)
      .is("country", null),
    admin.from("user_timeline_progress").select("timeline_template_item_id, completed").eq("user_id", user.id),
    admin.from("draft_answers").select("content").eq("user_id", user.id),
    admin.from("interview_questions").select("id", { count: "exact", head: true }).eq("status", "approved").eq("kind", "interview"),
    admin
      .from("mistake_entries")
      .select("title")
      .eq("status", "approved")
      .order("upvotes_count", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("connection_requests")
      .select("id", { count: "exact", head: true })
      .eq("to_user_id", user.id)
      .eq("status", "pending"),
  ]);

  // Discover: count of other applicants sharing >=1 major or university.
  const ownUniversityIds = (ownUniversityChoices ?? []).map((c) => c.university_id);
  const sharedIds = new Set<string>();
  const [majorMatches, universityMatches] = await Promise.all([
    profile?.major
      ? admin.from("profiles").select("id").eq("major", profile.major).not("username", "is", null).neq("id", user.id)
      : Promise.resolve({ data: [] as { id: string }[] }),
    ownUniversityIds.length > 0
      ? admin.from("university_choices").select("user_id").in("university_id", ownUniversityIds).neq("user_id", user.id)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);
  for (const row of majorMatches.data ?? []) sharedIds.add(row.id);
  for (const row of universityMatches.data ?? []) sharedIds.add((row as { user_id: string }).user_id);

  // Timeline: soonest-due incomplete item, plus an overall done/total fraction.
  const completedIds = new Set((progressRows ?? []).filter((p) => p.completed).map((p) => p.timeline_template_item_id));
  const totalTimelineItems = templateItems?.length ?? 0;
  const doneTimelineItems = completedIds.size;

  let nextUpLabel: string | null = null;
  let nextUpDays: number | null = null;
  // True once the estimated deadline for the user's stored (track,
  // application_year) is already in the past -- e.g. an account still set
  // to a cycle whose deadline passed months ago. Surfaced as a "this cycle
  // has closed" message instead of a nonsensical negative countdown; never
  // auto-changes the stored application_year.
  let cycleClosed = false;
  if (profile?.track && profile?.application_year) {
    const deadline = estimateApplicationDeadline(profile.track as Track, profile.application_year);
    if (deadline.getTime() < new Date().getTime()) {
      cycleClosed = true;
    } else {
      const incomplete = (templateItems ?? [])
        .filter((t) => !completedIds.has(t.id))
        .map((t) => ({ label: t.item_label, startBy: computeStartByDate(deadline, t.typical_deadline_offset_days) }))
        .sort((a, b) => a.startBy.getTime() - b.startBy.getTime());
      if (incomplete.length > 0) {
        nextUpLabel = incomplete[0].label;
        const now = new Date().getTime();
        nextUpDays = Math.ceil((incomplete[0].startBy.getTime() - now) / (1000 * 60 * 60 * 24));
      }
    }
  }

  const draftedCount = (draftRows ?? []).filter((d) => d.content.trim().length > 0).length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            Welcome back{profile?.username ? `, @${profile.username}` : ""}
          </h1>
          {track && (
            <div className="mt-2">
              <TrackBadge track={track} />
            </div>
          )}
        </div>
      </div>

      <Card className="mt-8 bg-primary text-white">
        <MicroLabel className="text-white/60">Next up · Timeline</MicroLabel>
        {cycleClosed ? (
          <>
            <h2 className="mt-1 text-[19px] font-semibold leading-snug">This application cycle&apos;s deadline has passed</h2>
            <p className="mt-1 text-[13.5px] text-white/70">Update your application year in your profile to keep tracking your timeline.</p>
          </>
        ) : (
          <>
            <h2 className="mt-1 text-[19px] font-semibold leading-snug" title="Estimated from your track and application year -- not an official NIIED deadline.">
              {nextUpLabel
                ? nextUpDays === null || nextUpDays > 0
                  ? `${nextUpLabel} is due in ${nextUpDays ?? 0} day${nextUpDays === 1 ? "" : "s"}`
                  : nextUpDays === 0
                    ? `${nextUpLabel} is due today`
                    : `${nextUpLabel} was due ${-nextUpDays} day${nextUpDays === -1 ? "" : "s"} ago`
                : "You're all caught up"}
            </h2>
            <p className="mt-1 text-[13.5px] text-white/70">
              {doneTimelineItems} of {totalTimelineItems} timeline steps done.
            </p>
          </>
        )}
        <Link
          href="/timeline"
          className="mt-4 inline-flex h-10 items-center rounded-full bg-white px-4 text-[13.5px] font-medium text-primary shadow-xs transition-all duration-150 hover:bg-white/90 active:scale-[0.97]"
        >
          Open timeline
        </Link>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Link href="/requests?tab=discover">
          <Card interactive className="h-full">
            <Users className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Discover</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {sharedIds.size} applicant{sharedIds.size === 1 ? "" : "s"} share your major or universities
            </p>
          </Card>
        </Link>
        <Link href="/interview-db">
          <Card interactive className="h-full">
            <MessageSquare className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Interview DB</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {draftedCount} of {totalApprovedQuestions ?? 0} drafted
            </p>
          </Card>
        </Link>
        <Link href="/mistakes">
          <Card interactive className="h-full">
            <AlertTriangle className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Mistakes</h2>
            <p className="mt-1 truncate text-[13px] leading-relaxed text-muted">
              {topMistake?.title ? `Top: ${topMistake.title}` : "Learn from others' mistakes"}
            </p>
          </Card>
        </Link>
        <Link href="/eca">
          <Card interactive className="h-full">
            <Award className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Extracurriculars</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">Browse ranked activities</p>
          </Card>
        </Link>
        <Link href="/requests?tab=received">
          <Card interactive className="h-full">
            <Inbox className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Requests</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {pendingRequestsCount ?? 0} pending request{pendingRequestsCount === 1 ? "" : "s"}
            </p>
          </Card>
        </Link>
        <Link href={`/profile/${profile?.username ?? ""}`}>
          <Card interactive className="h-full">
            <UserRound className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Your profile</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">See what others see</p>
          </Card>
        </Link>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3 border-t border-hairline pt-6">
        <p className="text-[12.5px] text-muted">7 features, all reachable from home or the ••• menu</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted">
          <ArrowDown className="h-3.5 w-3.5" />
        </span>
      </div>
    </main>
  );
}
