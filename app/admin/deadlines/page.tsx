import type { Metadata } from "next";
import { requireAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { DeadlineProposalQueue, type ProposalRow, type ProposalStatus } from "@/components/admin/deadline-proposal-queue";
import { getSourceHealth, getJobHealth } from "@/lib/automation/health";
import { assistantMode } from "@/lib/assistant/config";
import { getLiveVerifiedDeadlines } from "@/lib/deadlines/live";
import { findStaticLiveConflicts } from "@/lib/deadlines/live-schema";
import { deadlineNoticeDataset } from "@/lib/deadlines";

export const metadata: Metadata = { title: "Deadline Assistant — KMate" };
export const dynamic = "force-dynamic";

/**
 * The assistant's queue, plus the automation health the audit found missing.
 *
 * Health sits at the top on purpose: a queue that looks empty means something
 * very different when the job behind it has not run in two weeks, and that
 * distinction was previously invisible anywhere in the product.
 */
export default async function AdminDeadlinesPage() {
  await requireAdmin();

  const admin = getSupabaseAdmin();
  const [{ data }, sources, jobs] = await Promise.all([
    admin
      .from("deadline_proposals")
      .select(
        "id, candidate_date, proposed_date, classification, program, track, cycle, deadline_type, scope_type, country, university, confidence, evidence, reason, status, source_url, queue_id, notice:notices ( title )"
      )
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200),
    getSourceHealth(),
    getJobHealth(),
  ]);

  // Static-vs-live disagreements. The applicant feed already withholds these;
  // this is where they become visible to someone who can settle them. Nothing
  // here resolves or overwrites anything -- it reports.
  const conflicts = findStaticLiveConflicts(await getLiveVerifiedDeadlines(), deadlineNoticeDataset.deadlines);

  const rows = data ?? [];
  const items: ProposalRow[] = rows.map((r) => ({
    id: r.id,
    title: (r.notice as { title?: string } | null)?.title ?? "(notice title unavailable)",
    sourceUrl: r.source_url,
    candidateDate: r.candidate_date,
    proposedDate: r.proposed_date,
    classification: r.classification,
    program: r.program,
    track: r.track,
    cycle: r.cycle,
    deadlineType: r.deadline_type,
    scopeType: r.scope_type,
    country: r.country,
    university: r.university,
    confidence: Number(r.confidence),
    evidence: r.evidence,
    reason: r.reason,
    status: r.status as ProposalStatus,
  }));

  const count = (s: ProposalStatus) => items.filter((i) => i.status === s).length;
  // needs_review first -- that is the only group asking for anything.
  const order: ProposalStatus[] = ["needs_review", "auto_verified", "admin_verified", "rejected_not_deadline", "superseded"];
  const ordered = [...items].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

  // Grouped by state rather than a single "stale" flag: "never run" and
  // "failing" call for different actions, and a job that ran and found
  // nothing is healthy, not broken.
  const unhealthySources = sources.filter((s) => s.state !== "healthy");
  const unhealthyJobs = jobs.filter((j) => j.state !== "healthy");
  const STATE_LABEL: Record<string, string> = {
    failing: "failing",
    stale: "stale",
    never_run: "never run",
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Deadline assistant</h1>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
        Candidate dates from approved GKS notices, classified automatically. Approving here records a
        verified deadline; the assistant never creates one on its own unless every gate condition passes.
      </p>
      <div className="mt-4">
        <AdminNav active="/admin/deadlines" />
      </div>

      {/* ---------------- automation health ---------------- */}
      <div className="mt-6 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-hairline">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-ink">Automation health</p>
          <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
            mode: {assistantMode()}
          </span>
        </div>

        {unhealthyJobs.length === 0 && unhealthySources.length === 0 ? (
          <p className="mt-1.5 text-[12.5px] text-muted">
            Every scheduled job and official source is healthy. A run that found nothing counts as
            healthy — zero new items is a normal day.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
            {unhealthyJobs.map((j) => (
              <li key={j.job} className={j.state === "failing" ? "text-gold" : "text-muted"}>
                <span className="font-medium text-ink">{j.job}</span> — {STATE_LABEL[j.state]}
                {j.lastRunAt ? `, last ran ${j.hoursSinceRun}h ago` : ""}
                {j.lastError ? `: ${j.lastError}` : ""}
              </li>
            ))}
            {unhealthySources.map((s) => (
              <li key={s.id} className={s.state === "failing" ? "text-gold" : "text-muted"}>
                <span className="font-medium text-ink">{s.name}</span> — {STATE_LABEL[s.state]}
                {s.lastSuccessfulAt ? `, last succeeded ${s.hoursSinceSuccess}h ago` : ""}
                {s.consecutiveFailures > 0 ? ` (${s.consecutiveFailures} consecutive failures)` : ""}
                {s.lastError ? `: ${s.lastError}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------------- static / live conflicts ---------------- */}
      {conflicts.length > 0 && (
        <div className="mt-4 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-hairline">
          <p className="text-[13px] font-medium text-ink">
            Curated / live date conflicts ({conflicts.length})
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            A verified live deadline disagrees with the curated dataset. Applicants keep seeing the
            curated date; the live one is withheld until someone resolves this. Nothing is changed
            automatically.
          </p>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {conflicts.map((c) => (
              <li key={c.liveId} className="border-t border-hairline pt-2.5 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink">
                    {c.program}
                  </span>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                    {c.track ?? "both tracks"}
                  </span>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                    cycle {c.cycle}
                  </span>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                    {c.deadlineType}
                  </span>
                </div>
                <p className="mt-1.5 text-[12.5px] text-ink">
                  curated <span className="font-medium">{c.staticDate}</span> · live{" "}
                  <span className="font-medium text-gold">{c.liveDate}</span>
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{c.reason}</p>
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block max-w-full break-all text-[12px] font-medium text-primary hover:underline"
                >
                  {c.sourceUrl}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 text-[12.5px] text-muted">
        {count("needs_review")} needs review · {count("auto_verified")} auto verified ·{" "}
        {count("admin_verified")} verified · {count("rejected_not_deadline")} not a deadline ·{" "}
        {count("superseded")} superseded
      </p>

      <div className="mt-3">
        <DeadlineProposalQueue items={ordered} />
      </div>
    </main>
  );
}
