import type { Metadata } from "next";
import Link from "next/link";
import {
  Users,
  MessageSquare,
  MessageCircle,
  Bot,
  AlertTriangle,
  Award,
  Inbox,
  UserRound,
  ArrowDown,
  ExternalLink,
  FileText,
  Stamp,
  BarChart3,
  UserCheck,
  Megaphone,
  GraduationCap,
  ClipboardCheck,
  FolderCheck,
  HelpCircle,
} from "lucide-react";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { Card, MicroLabel } from "@/components/ui/card";
import { TrackBadge } from "@/components/ui/track-badge";
import { DeadlineBannerText } from "@/components/home/deadline-banner";
import { WarningBanner } from "@/components/notifications/warning-banner";
import { ContactWalletNudge } from "@/components/contacts/contact-wallet-nudge";
import { pickSpotlight } from "@/lib/scholarships/spotlight";
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
    { data: newestScholarships },
    { data: draftRows },
    { count: totalApprovedQuestions },
    { data: topMistake },
    { count: pendingRequestsCount },
    { count: contactMethodsCount },
    { count: connectedCount },
    { count: currentNoticesCount },
    { count: activeScholarshipsCount },
    { data: conversationRows },
  ] = await Promise.all([
    admin.from("university_choices").select("university_id").eq("user_id", user.id),
    // The most recently added active scholarships. One is spotlighted below;
    // the pool is small so a fresh one surfaces each time you come back.
    admin
      .from("scholarships")
      .select("id, university_name, scholarship_name, benefit_type, tuition_coverage, deadline, deadline_type, source_url, created_at")
      .eq("is_active", true)
      .neq("status", "expired")
      .order("created_at", { ascending: false })
      .limit(8),
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
    admin.from("contact_methods").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    admin
      .from("connection_requests")
      .select("id", { count: "exact", head: true })
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .eq("status", "accepted"),
    admin
      .from("notices")
      .select("id", { count: "exact", head: true })
      .in("status", ["new", "current"])
      .eq("is_active", true),
    admin
      .from("scholarships")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "expiring_soon"])
      .eq("is_active", true),
    admin
      .from("conversations")
      .select("id")
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`),
  ]);

  const conversationIds = (conversationRows ?? []).map((c) => c.id);

  // Discover: count of other applicants sharing >=1 major or university.
  const ownUniversityIds = (ownUniversityChoices ?? []).map((c) => c.university_id);
  const sharedIds = new Set<string>();
  const [majorMatches, universityMatches, unreadMessages] = await Promise.all([
    profile?.major
      ? admin.from("profiles").select("id").eq("major", profile.major).not("username", "is", null).neq("id", user.id)
      : Promise.resolve({ data: [] as { id: string }[] }),
    ownUniversityIds.length > 0
      ? admin.from("university_choices").select("user_id").in("university_id", ownUniversityIds).neq("user_id", user.id)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
    // Unread = a message in one of my conversations, sent by the other person,
    // that I haven't opened yet -- same rule /messages uses per-thread.
    conversationIds.length > 0
      ? admin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", conversationIds)
          .neq("sender_id", user.id)
          .is("read_at", null)
      : Promise.resolve({ count: 0 }),
  ]);

  const unreadMessageCount = unreadMessages.count ?? 0;
  for (const row of majorMatches.data ?? []) sharedIds.add(row.id);
  for (const row of universityMatches.data ?? []) sharedIds.add((row as { user_id: string }).user_id);

  // One scholarship to spotlight, drawn from the most recently added ones.
  // Picked per request rather than pinned, so returning to the dashboard
  // surfaces a different recent scholarship instead of the same one forever.
  // Nothing about the scholarship itself is invented here -- every field
  // shown is rendered only if the source stated it.
  const scholarshipPool = newestScholarships ?? [];
  const spotlight = pickSpotlight(scholarshipPool, user.id);

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

      <div className="mt-4 flex flex-col gap-3">
        <WarningBanner />
        <ContactWalletNudge hasContacts={Boolean(contactMethodsCount)} username={profile?.username ?? null} />
      </div>

      <Card className="mt-8 bg-primary text-white">
        <MicroLabel className="text-white/60">Application calendar</MicroLabel>
        {track ? (
          <DeadlineBannerText track={track} />
        ) : (
          <h2 className="mt-1 text-[19px] font-semibold leading-snug">Set your track to see your application calendar</h2>
        )}
        <Link
          href="/application-readiness"
          className="mt-4 inline-flex h-10 items-center rounded-full bg-white px-4 text-[13.5px] font-medium text-primary shadow-xs transition-all duration-150 hover:bg-white/90 active:scale-[0.97]"
        >
          Open application readiness
        </Link>
      </Card>

      {/* A different recent scholarship each time you land here, so the
          dashboard surfaces what has newly been added rather than sitting
          static. Only fields the source actually stated are rendered -- a
          null benefit or deadline is simply left out, never filled in. */}
      {spotlight && (
        <Card className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MicroLabel>New in scholarships</MicroLabel>
            <span className="text-[11.5px] text-muted">
              {scholarshipPool.length} recently added
            </span>
          </div>

          <div>
            <h2 className="text-[15px] font-semibold leading-snug text-ink">
              {spotlight.scholarship_name}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">{spotlight.university_name}</p>
          </div>

          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            {spotlight.benefit_type && (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Benefit</dt>
                <dd className="mt-0.5 text-[13px] text-ink">{spotlight.benefit_type}</dd>
              </div>
            )}
            {/* Several sources repeat the same sentence in both columns --
                showing it twice adds nothing, so the second is dropped when
                it just restates the first. */}
            {spotlight.tuition_coverage && spotlight.tuition_coverage !== spotlight.benefit_type && (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Tuition</dt>
                <dd className="mt-0.5 text-[13px] text-ink">{spotlight.tuition_coverage}</dd>
              </div>
            )}
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Deadline</dt>
              <dd className="mt-0.5 text-[13px] text-ink">
                {spotlight.deadline
                  ? new Date(spotlight.deadline).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : spotlight.deadline_type === "admission_schedule"
                    ? "Follows the admission schedule"
                    : spotlight.deadline_type === "automatic"
                      ? "Granted without application"
                      : "Not stated"}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-3">
            <Link
              href="/scholarships"
              className="text-[12.5px] font-medium text-primary hover:underline"
            >
              See all scholarships
            </Link>
            <a
              href={spotlight.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted hover:text-ink"
            >
              Official source
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Link href="/application-readiness">
          <Card interactive className="h-full">
            <FolderCheck className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Application Readiness</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Track every document for your application
            </p>
          </Card>
        </Link>
        <Link href="/requirement-checker">
          <Card interactive className="h-full">
            <ClipboardCheck className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Requirement Checker</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              What each university officially requires
            </p>
          </Card>
        </Link>
        <Link href="/requests?tab=discover">
          <Card interactive className="h-full">
            <Users className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Discover</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {sharedIds.size} applicant{sharedIds.size === 1 ? "" : "s"} share your major or universities
            </p>
          </Card>
        </Link>
        <Link href="/messages">
          <Card interactive className="h-full">
            <MessageCircle className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Messages</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {unreadMessageCount > 0
                ? `${unreadMessageCount} unread message${unreadMessageCount === 1 ? "" : "s"}`
                : "Chat with your connections"}
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
        <Link href="/gks">
          <Card interactive className="h-full">
            <Bot className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">GKS Assistant</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">Ask about the official GKS guidelines</p>
          </Card>
        </Link>
        <Link href="/faq-trends">
          <Card interactive className="h-full">
            <HelpCircle className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">FAQ Trends</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              What applicants are asking most
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
        <Link href="/notices">
          <Card interactive className="h-full">
            <Megaphone className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Official Notices</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {currentNoticesCount ?? 0} current announcement{currentNoticesCount === 1 ? "" : "s"}
            </p>
          </Card>
        </Link>
        <Link href="/scholarships">
          <Card interactive className="h-full">
            <GraduationCap className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Scholarships</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {activeScholarshipsCount ?? 0} active university scholarship{activeScholarshipsCount === 1 ? "" : "s"}
            </p>
          </Card>
        </Link>
        <Link href="/official-guidelines">
          <Card interactive className="h-full">
            <FileText className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Official Guidelines</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">Official GKS notices and guideline PDFs</p>
          </Card>
        </Link>
        <Link href="/apostille">
          <Card interactive className="h-full">
            <Stamp className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Apostille Guide</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">Which documents need an apostille</p>
          </Card>
        </Link>
        <Link href="/scholar-stats">
          <Card interactive className="h-full">
            <BarChart3 className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Scholar Stats</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">Where past scholars placed</p>
          </Card>
        </Link>
        <Link href="/requests?tab=connected">
          <Card interactive className="h-full">
            <UserCheck className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Connections</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {connectedCount ?? 0} connected applicant{connectedCount === 1 ? "" : "s"}
            </p>
          </Card>
        </Link>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3 border-t border-hairline pt-6">
        <p className="text-[12.5px] text-muted">15 features, all reachable from home or the ••• menu</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted">
          <ArrowDown className="h-3.5 w-3.5" />
        </span>
      </div>
    </main>
  );
}
