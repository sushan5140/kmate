import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { CandidateDate } from "@/lib/notices/review-schema";
import { proposeFromCandidate, type NoticeContext } from "./deadline-assistant";
import { evaluateGate } from "./gate";
import { reconcile, type ExistingDeadline } from "./dedupe";
import { writeAudit } from "./audit";
import { assistantMode } from "./config";
import { promoteProposal } from "./promote";

/**
 * The assistant pipeline: approved notices in, proposals out.
 *
 * Reads only what a human has already approved. An unapproved or rejected
 * notice is never considered at all -- not filtered out later, not proposed
 * with low confidence, simply not read. That is the product rule "approve
 * notice != verify deadline" enforced at the point where it would otherwise
 * be easiest to erode.
 *
 * Writes proposals and audit rows, and -- when the strict gate passes in full
 * -- promotes one into public.verified_deadlines via promoteProposal, which
 * re-checks the status itself. The curated dataset in
 * data/deadlines-notices-data.json is still never written at runtime; live
 * verified deadlines live in the database beside it.
 */

export interface AssistantRunResult {
  mode: string;
  noticesConsidered: number;
  candidatesConsidered: number;
  proposed: number;
  autoVerified: number;
  needsReview: number;
  rejectedNotDeadline: number;
  duplicatesSkipped: number;
  conflicts: number;
  extensions: number;
  schemaFailures: number;
  errors: string[];
}

interface QueueRow {
  id: string;
  notice_id: string;
  source_url: string;
  source_notice_id: string | null;
  title: string;
  program: string;
  track: string | null;
  status: string;
  extracted_dates: unknown;
  published_at: string | null;
  notice: { id: string; clean_text: string | null; title: string; is_active: boolean } | null;
}

export async function runDeadlineAssistant(): Promise<AssistantRunResult> {
  const admin = getSupabaseAdmin();
  const out: AssistantRunResult = {
    mode: assistantMode(),
    noticesConsidered: 0,
    candidatesConsidered: 0,
    proposed: 0,
    autoVerified: 0,
    needsReview: 0,
    rejectedNotDeadline: 0,
    duplicatesSkipped: 0,
    conflicts: 0,
    extensions: 0,
    schemaFailures: 0,
    errors: [],
  };

  // APPROVED notices only. This is the gate that makes everything downstream
  // safe, so it is a query filter rather than a later check.
  const { data, error } = await admin
    .from("notice_review_queue")
    .select(
      "id, notice_id, source_url, source_notice_id, title, program, track, status, extracted_dates, published_at, notice:notices ( id, clean_text, title, is_active )"
    )
    .eq("status", "approved");

  if (error) {
    out.errors.push(`loading approved notices failed: ${error.message}`);
    return out;
  }

  const rows = (data ?? []) as unknown as QueueRow[];

  // Existing proposals that already represent a settled deadline, used for
  // conflict and extension detection.
  const { data: settled } = await admin
    .from("deadline_proposals")
    .select("id, program, cycle, track, scope_type, country, university, deadline_type, proposed_date, source_url")
    .in("status", ["auto_verified", "admin_verified"]);

  const existing: ExistingDeadline[] = (settled ?? []).map((s) => ({
    id: s.id,
    program: s.program,
    cycle: s.cycle,
    track: s.track,
    scope_type: s.scope_type,
    country: s.country,
    university: s.university,
    deadline_type: s.deadline_type,
    date: s.proposed_date,
    sourceUrl: s.source_url,
    sourceNoticeId: null,
  }));

  for (const row of rows) {
    if (!row.notice || row.notice.is_active === false) continue;
    out.noticesConsidered++;

    const candidates: CandidateDate[] = Array.isArray(row.extracted_dates)
      ? (row.extracted_dates as CandidateDate[])
      : [];
    if (candidates.length === 0) continue;

    const ctx: NoticeContext = {
      title: row.title,
      body: row.notice.clean_text ?? "",
      sourceUrl: row.source_url,
      publishedAt: row.published_at,
      approvedProgram: (row.program === "GKS-U" || row.program === "GKS-G" ? row.program : "unknown"),
      approvedTrack: (row.track === "embassy" || row.track === "university" ? row.track : null),
    };
    const noticeText = `${row.title}\n${row.notice.clean_text ?? ""}`;

    for (const candidate of candidates) {
      out.candidatesConsidered++;

      const parsed = proposeFromCandidate({ notice: ctx, candidate, siblings: candidates });
      if (!parsed.ok) {
        // A schema failure is never a write. It becomes a review item with
        // the validation errors as its reason, so the admin sees why.
        out.schemaFailures++;
        await upsertProposal(row, candidate, {
          status: "needs_review",
          reason: `assistant output failed validation: ${parsed.errors.join("; ")}`,
          evidence: candidate.context || row.title,
          confidence: 0,
        }, out);
        continue;
      }

      const proposal = parsed.value;

      const outcome = reconcile(proposal, row.source_url, row.source_notice_id, existing, noticeText);
      if (outcome.kind === "duplicate") {
        out.duplicatesSkipped++;
        continue;
      }

      const conflictDates = candidates
        .filter((c) => c.kind === candidate.kind && c.date !== candidate.date)
        .map((c) => c.date);

      const gate = evaluateGate(proposal, {
        noticeApproved: true,
        officialSource: true,
        existingVerifiedDate:
          outcome.kind === "conflict" || outcome.kind === "extension" ? outcome.existingDate : null,
        conflictingCandidateDates: conflictDates,
      });

      const reasonParts = [proposal.reason];
      if (outcome.kind === "conflict") {
        out.conflicts++;
        reasonParts.push(outcome.reason);
      }
      if (outcome.kind === "extension") {
        out.extensions++;
        reasonParts.push(`${outcome.reason} -- superseding requires review`);
      }
      if (gate.failed.length) reasonParts.push(...gate.failed);
      if (gate.suppressedByFlag) {
        reasonParts.push("the gate passed in full; auto-verify is disabled, so this is a suggestion only");
      }

      const status =
        gate.decision === "auto_verified"
          ? "auto_verified"
          : gate.decision === "rejected_not_deadline"
            ? "rejected_not_deadline"
            : "needs_review";

      if (status === "auto_verified") out.autoVerified++;
      else if (status === "rejected_not_deadline") out.rejectedNotDeadline++;
      else out.needsReview++;

      await upsertProposal(
        row,
        candidate,
        {
          status,
          reason: reasonParts.join("; "),
          evidence: proposal.evidence,
          confidence: proposal.confidence,
          proposal,
        },
        out
      );
    }
  }

  return out;
}

interface UpsertPayload {
  status: string;
  reason: string;
  evidence: string;
  confidence: number;
  proposal?: {
    classification: string;
    program: string | null;
    track: string | null;
    cycle: number | null;
    deadline_type: string | null;
    scope_type: string | null;
    country: string | null;
    university: string | null;
    date: string | null;
    timezone: string | null;
  };
}

/**
 * Writes one proposal, keyed on (notice, candidate date, kind) so a re-run
 * updates its own row instead of creating a second one -- the DB carries the
 * same uniqueness, so idempotency does not depend on this logic being right.
 *
 * A row a person has already decided is never overwritten by a later run.
 */
async function upsertProposal(
  row: QueueRow,
  candidate: CandidateDate,
  payload: UpsertPayload,
  out: AssistantRunResult
): Promise<void> {
  const admin = getSupabaseAdmin();
  const p = payload.proposal;

  const { data: prior } = await admin
    .from("deadline_proposals")
    .select("*")
    .eq("notice_id", row.notice_id)
    .eq("candidate_date", candidate.date)
    .eq("candidate_kind", candidate.kind)
    .maybeSingle();

  // An admin decision outranks the assistant. Re-running must never quietly
  // reopen or overwrite something a person has already settled.
  if (prior && (prior.status === "admin_verified" || prior.status === "rejected_not_deadline")) {
    return;
  }

  const values = {
    notice_id: row.notice_id,
    queue_id: row.id,
    candidate_date: candidate.date,
    candidate_kind: candidate.kind,
    classification: p?.classification ?? "ambiguous",
    program: p?.program ?? null,
    track: p?.track ?? null,
    cycle: p?.cycle ?? null,
    deadline_type: p?.deadline_type ?? null,
    scope_type: p?.scope_type ?? null,
    country: p?.country ?? null,
    university: p?.university ?? null,
    proposed_date: p?.date ?? null,
    timezone: p?.timezone ?? null,
    confidence: payload.confidence,
    evidence: payload.evidence,
    reason: payload.reason,
    source_url: row.source_url,
    status: payload.status,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await admin
    .from("deadline_proposals")
    .upsert(values, { onConflict: "notice_id,candidate_date,candidate_kind" })
    .select("id")
    .maybeSingle();

  if (error || !saved) {
    out.errors.push(`saving proposal for ${row.source_url} (${candidate.date}) failed: ${error?.message ?? "no row"}`);
    return;
  }

  out.proposed++;

  // The strict gate passing is one of exactly two things that may create an
  // applicant-facing deadline. promoteProposal re-checks the status itself,
  // so this cannot be widened by accident from here.
  if (payload.status === "auto_verified") {
    const promoted = await promoteProposal(saved.id, null);
    if (!promoted.ok) out.errors.push(`promotion skipped for ${saved.id}: ${promoted.reason}`);
  }

  await writeAudit({
    entityType: "deadline_proposal",
    entityId: saved.id,
    action: payload.status === "auto_verified" ? "auto_verified" : "assistant_proposed",
    actorType: "assistant",
    previousValue: prior ?? null,
    newValue: values,
    confidence: payload.confidence,
    evidence: payload.evidence,
    reason: payload.reason,
    sourceUrl: row.source_url,
  });
}
