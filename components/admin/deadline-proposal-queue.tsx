"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Assistant proposals, grouped by what the automation decided.
 *
 * The point of this screen is that an admin resolves uncertainty rather than
 * transcribing notices: every field arrives prefilled, and the common case is
 * one click. What it deliberately does NOT show is any model reasoning --
 * only the structured `reason` and the verbatim `evidence` quoted from the
 * official notice, both of which a person can check against the source.
 */

export type ProposalStatus =
  | "needs_review"
  | "auto_verified"
  | "admin_verified"
  | "rejected_not_deadline"
  | "superseded";

export interface ProposalRow {
  id: string;
  title: string;
  sourceUrl: string;
  candidateDate: string;
  proposedDate: string | null;
  classification: string;
  program: string | null;
  track: string | null;
  cycle: number | null;
  deadlineType: string | null;
  scopeType: string | null;
  country: string | null;
  university: string | null;
  confidence: number;
  evidence: string;
  reason: string;
  status: ProposalStatus;
}

const STATUS_LABEL: Record<ProposalStatus, string> = {
  needs_review: "Needs review",
  auto_verified: "Auto verified",
  admin_verified: "Verified by admin",
  rejected_not_deadline: "Not a deadline",
  superseded: "Superseded",
};

const STATUS_STYLE: Record<ProposalStatus, string> = {
  needs_review: "bg-gold/10 text-gold",
  auto_verified: "bg-success-soft text-success",
  admin_verified: "bg-success-soft text-success",
  rejected_not_deadline: "bg-canvas text-muted",
  superseded: "bg-canvas text-muted",
};

const UNSET = "not stated";

function Field({ label, value }: { label: string; value: string | number | null }) {
  const empty = value === null || value === "";
  return (
    <div className="flex gap-2">
      <dt className="w-[74px] shrink-0 text-muted">{label}</dt>
      <dd className={empty ? "italic text-muted" : "text-ink"}>{empty ? UNSET : String(value)}</dd>
    </div>
  );
}

export function DeadlineProposalQueue({ items: initial }: { items: ProposalRow[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function decide(id: string, action: "approve" | "reject" | "pending" | "revert") {
    setBusy(id);
    setFailed(null);
    try {
      const res = await fetch(`/api/admin/deadline-proposals/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setFailed(id);
        return;
      }
      const { status } = (await res.json()) as { status?: ProposalStatus };
      // The row stays on screen with its new status so the decision is
      // visible and can be undone, rather than vanishing.
      if (status) setItems((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch {
      setFailed(id);
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-[14px] text-muted">No assistant proposals yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((p) => {
        const open = openId === p.id;
        return (
          <Card key={p.id} className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[p.status]}`}>
                {STATUS_LABEL[p.status]}
              </span>
              <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                {Math.round(p.confidence * 100)}% confidence
              </span>
              <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                {p.classification}
              </span>
            </div>

            <p className="break-words text-[14px] font-medium leading-snug text-ink">{p.title}</p>

            <dl className="flex flex-col gap-1 text-[12.5px]">
              <Field label="Program" value={p.program} />
              <Field label="Track" value={p.track} />
              <Field label="Cycle" value={p.cycle} />
              <Field label="Type" value={p.deadlineType} />
              <Field label="Scope" value={p.scopeType} />
              {p.country && <Field label="Country" value={p.country} />}
              {p.university && <Field label="University" value={p.university} />}
              <Field label="Date" value={p.proposedDate ?? p.candidateDate} />
            </dl>

            <p className="text-[12px] leading-relaxed text-muted">
              <span className="font-medium text-ink">Why: </span>
              {p.reason}
            </p>

            <button
              type="button"
              onClick={() => setOpenId(open ? null : p.id)}
              className="self-start text-[12.5px] font-medium text-primary hover:underline"
            >
              {open ? "Hide" : "Show"} evidence
            </button>
            {open && (
              <p className="break-words rounded-lg bg-canvas px-2.5 py-2 text-[11.5px] leading-relaxed text-muted">
                &ldquo;{p.evidence}&rdquo;
              </p>
            )}

            <a
              href={p.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block max-w-full break-all text-[12px] font-medium text-primary hover:underline"
            >
              Open the official notice
            </a>

            {failed === p.id && <p className="text-[12.5px] text-gold">That did not save. Try again.</p>}

            <div className="flex flex-wrap gap-2 border-t border-hairline pt-2.5">
              <Button
                size="sm"
                onClick={() => decide(p.id, "approve")}
                disabled={busy === p.id || p.status === "admin_verified"}
              >
                Approve suggestion
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => decide(p.id, "reject")}
                disabled={busy === p.id || p.status === "rejected_not_deadline"}
              >
                Not a deadline
              </Button>
              {p.status !== "needs_review" && (
                <Button size="sm" variant="ghost" onClick={() => decide(p.id, "pending")} disabled={busy === p.id}>
                  Leave pending
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => decide(p.id, "revert")} disabled={busy === p.id}>
                Revert
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
