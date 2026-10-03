import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getQueueRow, recordEvent } from "@/lib/youtube/queue";
import { isOpportunityType, isPriority, promotionCategoryOf } from "@/lib/youtube/classify";
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
  | { action: DecisionAction }
  | { action: "edit_draft"; draft: string }
  | { action: "set_priority"; priority: string }
  | { action: "set_opportunity"; opportunity_type: string }
  | { action: "set_follow_up"; manual_follow_up: boolean };

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

  // ---- triage -----------------------------------------------------------
  // Descriptive fields. None of these can make a row postable: postRefusal()
  // does not read priority or opportunity_type at all, and manual_follow_up
  // only ever REMOVES a row from posting. So these are editable in any state
  // except the ones where the row is already gone or in flight.
  if (
    body.action === "set_priority" ||
    body.action === "set_opportunity" ||
    body.action === "set_follow_up"
  ) {
    if (row.status === "POSTING") {
      return NextResponse.json({ error: "in_flight", status: row.status }, { status: 409 });
    }

    const patch: Record<string, unknown> = { updated_at: now };
    let detail: Record<string, unknown> = {};

    if (body.action === "set_priority") {
      if (!isPriority(body.priority)) {
        return NextResponse.json({ error: "invalid_priority" }, { status: 400 });
      }
      patch.priority = body.priority;
      detail = { priority: body.priority };
    } else if (body.action === "set_opportunity") {
      if (!isOpportunityType(body.opportunity_type)) {
        return NextResponse.json({ error: "invalid_opportunity_type" }, { status: 400 });
      }
      patch.opportunity_type = body.opportunity_type;
      detail = { opportunity_type: body.opportunity_type };
    } else {
      if (typeof body.manual_follow_up !== "boolean") {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      }
      patch.manual_follow_up = body.manual_follow_up;
      detail = { manual_follow_up: body.manual_follow_up };
    }

    const { error } = await admin.from("youtube_reply_queue").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

    // Recorded as a draft-edit event: it is an admin annotation, not a status
    // change, and the status columns stay null to say so.
    await recordEvent({
      queueId: id,
      eventType: "DRAFT_EDITED",
      actorUserId: user.id,
      metadata: { triage: true, ...detail },
    });

    return NextResponse.json({ ok: true, ...detail });
  }

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
    // Re-derived from the text the admin just wrote, so the category can never
    // drift away from what the reply actually says. Reporting only -- it does
    // not alter the draft and does not gate posting.
    const promotionCategory = promotionCategoryOf(draft);

    const { error } = await admin
      .from("youtube_reply_queue")
      .update({
        edited_draft: draft,
        status: nextStatus,
        promotion_category: promotionCategory,
        updated_at: now,
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

    await recordEvent({
      queueId: id,
      eventType: "DRAFT_EDITED",
      fromStatus: row.status,
      toStatus: nextStatus,
      actorUserId: user.id,
      metadata: { length: draft.length, promotion_category: promotionCategory },
    });

    return NextResponse.json({ ok: true, status: nextStatus, promotion_category: promotionCategory });
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
