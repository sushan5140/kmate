import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getQueueRow, recordEvent } from "@/lib/youtube/queue";
import {
  DECISION_ACTIONS,
  approveRefusal,
  canEditDraft,
  canHoldOrSkip,
  canMarkFailed,
  isDecisionAction,
  type DecisionAction,
} from "@/lib/youtube/queue-schema";

/**
 * An admin's decision about one queued reply: approve, hold, skip, release a
 * stuck post attempt, or edit the draft.
 *
 * The browser sends a verb, never a status. DECISION_ACTIONS is a server-side
 * map from verb to status and has no entry producing POSTING -- that state is
 * claimed by the posting route on itself and is unreachable from here, so no
 * request can put a row into the state that authorises an API call.
 *
 * Nothing in this route posts anything. Approving marks a row postable; a
 * separate, explicit click actually sends it.
 */

const MAX_DRAFT_LENGTH = 9500; // YouTube's comment ceiling is 10k characters.

type Body =
  | { action: DecisionAction; draft?: never }
  | { action: "edit_draft"; draft: string };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rateLimit = checkRateLimit(`youtube-decide:${user.id}`, 120, 5 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { id } = await params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const row = await getQueueRow(id);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  // ---- draft edit ------------------------------------------------------
  if (body.action === "edit_draft") {
    if (typeof body.draft !== "string") {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const draft = body.draft.trim();
    if (!draft) return NextResponse.json({ error: "empty_draft" }, { status: 400 });
    if (draft.length > MAX_DRAFT_LENGTH) {
      return NextResponse.json({ error: "draft_too_long" }, { status: 400 });
    }
    if (!canEditDraft(row)) {
      return NextResponse.json({ error: "not_editable", status: row.status }, { status: 409 });
    }

    // Edits are stored beside the import, never over it: final_draft stays as
    // the record of what arrived. An edit on an untouched row also moves it
    // out of SCRAPED, since a human has now looked at it.
    const nextStatus = row.status === "SCRAPED" ? "DRAFTED" : row.status;
    const { error } = await admin
      .from("youtube_reply_queue")
      .update({ edited_draft: draft, status: nextStatus, updated_at: now })
      .eq("id", id);

    if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

    await recordEvent({
      queueId: id,
      eventType: "DRAFT_EDITED",
      fromStatus: row.status,
      toStatus: nextStatus,
      actorUserId: user.id,
      metadata: { length: draft.length },
    });

    return NextResponse.json({ ok: true, status: nextStatus });
  }

  // ---- status decisions -------------------------------------------------
  if (!isDecisionAction(body.action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const action = body.action;
  const target = DECISION_ACTIONS[action];

  // Each verb has its own precondition. Approving is the strict one: a row
  // that could never legally post is refused here rather than parked in
  // APPROVED, where it would read as ready and fail at the click.
  if (action === "approve") {
    const refusal = approveRefusal(row);
    if (refusal) {
      return NextResponse.json({ error: "cannot_approve", reason: refusal }, { status: 409 });
    }
  } else if (action === "mark_failed") {
    if (!canMarkFailed(row)) {
      return NextResponse.json({ error: "not_in_flight", status: row.status }, { status: 409 });
    }
  } else if (!canHoldOrSkip(row)) {
    return NextResponse.json({ error: "not_decidable", status: row.status }, { status: 409 });
  }

  const { data, error } = await admin
    .from("youtube_reply_queue")
    .update({
      status: target,
      decided_by: user.id,
      decided_at: now,
      updated_at: now,
      // Approving after a failure clears the stale error so the row does not
      // keep displaying a problem that has been consciously accepted.
      ...(action === "approve" ? { last_error: null } : {}),
    })
    .eq("id", id)
    // Guard against a decision racing the posting route: the row must still
    // be in the state the precondition was checked against.
    .eq("status", row.status)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "conflict" }, { status: 409 });

  const eventType =
    action === "approve"
      ? "APPROVED"
      : action === "hold"
        ? "HELD"
        : action === "skip"
          ? "SKIPPED"
          : "POST_FAILED";

  await recordEvent({
    queueId: id,
    eventType,
    fromStatus: row.status,
    toStatus: target,
    actorUserId: user.id,
    metadata: action === "mark_failed" ? { released_by_admin: true } : {},
  });

  return NextResponse.json({ ok: true, status: target });
}
