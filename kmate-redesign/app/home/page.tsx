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
import { ApplicationDashboard } from "@/components/home/application-dashboard";
import { getApprovedGksNotices } from "@/lib/notices/published";
import { getLiveVerifiedDeadlines } from "@/lib/deadlines/live";
import { getProfileDefaults } from "@/lib/readiness/profile";
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
  // The same defaults Application Readiness prefills from, so "Create from my
  // profile" produces exactly the configuration that page would have.
  const readinessDefaults = await getProfileDefaults(user.id);

  // Approved GKS notices, read server-side through the service-role client.
  // notice_review_queue is never exposed to the browser -- only this narrow,
  // safe projection of its approved rows travels to the client.
  const approvedNotices = await getApprovedGksNotices();

  // Verified deadlines held in the database, merged with the curated dataset
  // by the matcher. Only status='active' rows are returned, so a revoked or
  // superseded verification stops reaching applicants immediately.
  const liveDeadlines = await getLiveVerifiedDeadlines();

  const scholarshipPool = newestScholarships ?? [];
  const spotlight = pickSpotlight(scholarshipPool, user.id);

  const draftedCount = (draftRows ?? []).filter((d) => d.content.trim().length > 0).length;

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <MicroLabel>Your workspace</MicroLabel>
          <h1 className="mt-2 text-[28px] font-extrabold tracking-[-0.035em] text-ink sm:text-[34px]">
            Welcome back{profile?.username ? `, @${profile.username}` : ""}
          </h1>
          <p className="mt-1.5 text-[12.5px] font-medium text-muted">
            Keep the application moving. Everything else can wait.
          </p>
        </div>
        {track && <TrackBadge track={track} />}
      </section>

      <div className="mt-5 flex flex-col gap-3">
        <WarningBanner />
        <ContactWalletNudge hasContacts={Boolean(contactMethodsCount)} username={profile?.username ?? null} />
      </div>

      <section className="mt-6 grid gap-3 lg:grid-cols-[1.45fr_.55fr]">
        <Card className="relative overflow-hidden border-0 bg-ink p-6 text-white shadow-[0_26px_65px_-38px_rgba(23,33,29,.72)] sm:p-7">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/30 blur-3xl" aria-hidden />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <MicroLabel className="text-white/48">Application calendar</MicroLabel>
                {track ? (
                  <DeadlineBannerText track={track} />
                ) : (
                  <h2 className="mt-2 max-w-xl text-[22px] font-extrabold leading-tight tracking-[-0.025em] text-white">
                    Set your track to see the next application milestone.
                  </h2>
                )}
              </div>
              <span className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-[10px] font-bold text-white/62">
                {profile?.application_year ?? "Cycle not set"}
              </span>
            </div>
            <p className="mt-4 max-w-2xl text-[12.5px] font-medium leading-6 text-white/58">
              Your route, documents, university extras, and verified deadline context stay together here.
            </p>
            <Link
              href="/application-readiness"
              className="pressable mt-6 inline-flex h-11 items-center rounded-[13px] bg-white px-4 text-[12.5px] font-extrabold text-ink shadow-xs hover:bg-white/92"
            >
              Continue application readiness
            </Link>
          </div>
        </Card>

        <Card className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-1">
          {[
            { label: "Relevant applicants", value: sharedIds.size, href: "/requests?tab=discover", icon: Users },
            { label: "Unread messages", value: unreadMessageCount, href: "/messages", icon: MessageCircle },
            { label: "Pending requests", value: pendingRequestsCount ?? 0, href: "/requests?tab=received", icon: Inbox },
            { label: "Interview drafts", value: draftedCount, href: "/interview-db", icon: MessageSquare },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className="pressable flex min-h-[78px] items-center gap-3 rounded-[16px] px-3 py-3 transition-colors hover:bg-canvas/75"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[20px] font-extrabold tracking-[-0.03em] text-ink">{item.value}</span>
                  <span className="block truncate text-[10.5px] font-semibold text-muted">{item.label}</span>
                </span>
              </Link>
            );
          })}
        </Card>
      </section>

      <section className="mt-4">
        <ApplicationDashboard
          cycle={profile?.application_year ? String(profile.application_year) : null}
          liveNotices={approvedNotices}
          liveDeadlines={liveDeadlines}
          defaults={{
            program: readinessDefaults.program,
            track: readinessDefaults.track,
            subtype: readinessDefaults.subtype,
            major: readinessDefaults.major,
            universities: readinessDefaults.universities,
          }}
        />
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-3">
        <Link href="/official-guidelines">
          <Card interactive className="h-full">
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
                <FileText className="h-4 w-4" />
              </span>
              <span className="text-[10px] font-extrabold text-muted">{currentNoticesCount ?? 0} current</span>
            </div>
            <h2 className="mt-5 text-[14px] font-extrabold tracking-[-0.015em] text-ink">Official guidance</h2>
            <p className="mt-1.5 text-[11.5px] font-medium leading-5 text-muted">
              Current rules, notices, and guideline PDFs with source context.
            </p>
          </Card>
        </Link>

        <Link href="/requirement-checker">
          <Card interactive className="h-full">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-gold-soft text-gold">
              <ClipboardCheck className="h-4 w-4" />
            </span>
            <h2 className="mt-5 text-[14px] font-extrabold tracking-[-0.015em] text-ink">Requirement checker</h2>
            <p className="mt-1.5 text-[11.5px] font-medium leading-5 text-muted">
              Compare university-specific requirements without hiding source age.
            </p>
          </Card>
        </Link>

        <Link href="/interview-db">
          <Card interactive className="h-full">
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
                <MessageSquare className="h-4 w-4" />
              </span>
              <span className="text-[10px] font-extrabold text-muted">{draftedCount}/{totalApprovedQuestions ?? 0}</span>
            </div>
            <h2 className="mt-5 text-[14px] font-extrabold tracking-[-0.015em] text-ink">Interview preparation</h2>
            <p className="mt-1.5 text-[11.5px] font-medium leading-5 text-muted">
              Structured questions with your private answer drafts kept beside them.
            </p>
          </Card>
        </Link>
      </section>

      {spotlight && (
        <Card className="mt-4 overflow-hidden p-0">
          <div className="grid md:grid-cols-[1fr_auto]">
            <div className="p-5 sm:p-6">
              <MicroLabel>Scholarship spotlight</MicroLabel>
              <h2 className="mt-2 text-[16px] font-extrabold tracking-[-0.02em] text-ink">
                {spotlight.scholarship_name}
              </h2>
              <p className="mt-1 text-[12px] font-semibold text-muted">{spotlight.university_name}</p>
              <div className="mt-4 flex flex-wrap gap-x-7 gap-y-3 text-[11px]">
                {spotlight.benefit_type && (
                  <div>
                    <span className="block text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-muted/65">Benefit</span>
                    <span className="mt-1 block font-semibold text-ink">{spotlight.benefit_type}</span>
                  </div>
                )}
                <div>
                  <span className="block text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-muted/65">Deadline</span>
                  <span className="mt-1 block font-semibold text-ink">
                    {spotlight.deadline
                      ? new Date(spotlight.deadline).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                      : spotlight.deadline_type === "admission_schedule"
                        ? "Admission schedule"
                        : spotlight.deadline_type === "automatic"
                          ? "Automatic"
                          : "Not stated"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-hairline bg-canvas/55 px-5 py-4 md:border-l md:border-t-0">
              <Link href="/scholarships" className="text-[11.5px] font-extrabold text-primary hover:underline">
                Browse scholarships
              </Link>
              <a
                href={spotlight.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11.5px] font-bold text-muted hover:text-ink"
              >
                Source <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </Card>
      )}

      <details className="group mt-4 overflow-hidden rounded-[22px] border border-hairline bg-surface/80 shadow-card">
        <summary className="cursor-pointer list-none px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[13px] font-extrabold text-ink">More KMate tools</p>
              <p className="mt-0.5 text-[10.5px] font-medium text-muted">
                Community, reference material, stats, and account tools.
              </p>
            </div>
            <ArrowDown className="h-4 w-4 text-muted transition-transform duration-200 ease-out group-open:rotate-180" />
          </div>
        </summary>

        <div className="grid grid-cols-2 gap-2 border-t border-hairline bg-canvas/35 p-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { href: "/gks", icon: Bot, title: "GKS Assistant", text: "Ask against official guideline context" },
            { href: "/faq-trends", icon: HelpCircle, title: "FAQ Trends", text: "See what applicants ask most" },
            { href: "/mistakes", icon: AlertTriangle, title: "Mistakes", text: topMistake?.title ? `Top: ${topMistake.title}` : "Learn from applicant mistakes" },
            { href: "/eca", icon: Award, title: "Extracurriculars", text: "Browse activity ideas" },
            { href: "/apostille", icon: Stamp, title: "Apostille", text: "Review document legalization" },
            { href: "/scholar-stats", icon: BarChart3, title: "Scholar Stats", text: "Explore past placements" },
            { href: "/requests?tab=connected", icon: UserCheck, title: "Connections", text: `${connectedCount ?? 0} connected applicants` },
            { href: profile?.username ? `/profile/${profile.username}` : "/settings/profile", icon: UserRound, title: "Profile", text: "See and edit your applicant identity" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.title}
                href={item.href}
                className="pressable rounded-[16px] bg-surface px-3.5 py-4 ring-1 ring-hairline transition-colors hover:bg-white"
              >
                <Icon className="h-4 w-4 text-primary" />
                <p className="mt-3 text-[11.5px] font-extrabold text-ink">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-[9.75px] font-medium leading-4 text-muted">{item.text}</p>
              </Link>
            );
          })}
        </div>
      </details>

      <p className="mt-6 text-center text-[10px] font-medium text-muted/70">
        KMate keeps official rules, older university sources, and community experience visibly separate.
      </p>
    </main>
  );
}
