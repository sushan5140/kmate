import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  countPostable,
  currentDayRange,
  dailyPostLimit,
  listPostable,
  postAllowance,
} from "@/lib/youtube/queue";
import { clampBatchSize, MAX_BATCH_REQUEST } from "@/lib/youtube/queue-schema";
import { newPostContext, postBatch } from "@/lib/youtube/post-runner";
import { assertExpectedChannel } from "@/lib/youtube/api";

/**
 * Posts a small, admin-chosen batch of approved replies.
 *
 * This is a HUMAN-TRIGGERED action and nothing else. There is no cron, no
 * queue drainer, no background worker and no retry: the endpoint only ever
 * runs because an admin clicked "Post selected batch", it sends the number
 * they chose, and then it stops.
 *
 * What the browser may send:
 *
 *   { ids: string[] }   -- queue row ids to consider, or
 *   { count: number }   -- "take the next N eligible rows"
 *
 * and nothing else. It may not send comment ids, reply text, statuses, or a
 * daily limit. Ids are treated purely as a SELECTION: every row is re-read
 * from the database and re-checked individually inside the runner, so naming
 * a row in the list grants it nothing it did not already have.
 *
 * Sequential by construction, never concurrent, and it stops the moment an
 * outcome is ambiguous -- see postBatch().
 */

interface Body {
  ids?: unknown;
  count?: unknown;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // A batch is several outside effects, so the budget is tight.
  const rateLimit = checkRateLimit(`youtube-post-batch:${user.id}`, 5, 10 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // The allowance is computed server-side from the database. Nothing the
  // browser sends contributes to it.
  const limit = dailyPostLimit();
  const range = currentDayRange();
  const eligible = await countPostable();
  // Measured against both the calendar day and the rolling 24 hours; the
  // stricter governs. maxBatch already folds in effectiveRemaining, so a
  // requested size can never exceed what the backstop permits.
  const allowance = await postAllowance(eligible);

  if (allowance.maxBatch === 0) {
    return NextResponse.json(
      { error: "nothing_to_post", allowance, day: range.day },
      { status: 409 }
    );
  }

  // Resolve the selection to concrete ids, then clamp it to the allowance.
  let selected: string[];

  if (Array.isArray(body.ids)) {
    const ids = body.ids
      .filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 64)
      .slice(0, MAX_BATCH_REQUEST);
    if (ids.length === 0) return NextResponse.json({ error: "no_ids" }, { status: 400 });
    selected = ids.slice(0, allowance.maxBatch);
  } else {
    const requested = clampBatchSize(Number(body.count), allowance);
    if (requested === 0) {
      return NextResponse.json(
        { error: "invalid_count", allowance, max_batch: allowance.maxBatch },
        { status: 400 }
      );
    }
    // Server picks the rows: highest priority, oldest comment first.
    const candidates = await listPostable(requested);
    selected = candidates.slice(0, requested).map((row) => row.id);
    if (selected.length === 0) {
      return NextResponse.json({ error: "nothing_to_post", allowance }, { status: 409 });
    }
  }

  // One channel check for the run. It validates the credentials, which do not
  // change between rows, and it fails closed when YOUTUBE_CHANNEL_ID is unset.
  try {
    await assertExpectedChannel();
  } catch (error) {
    const message = error instanceof Error ? error.message : "channel check failed";
    return NextResponse.json({ error: "channel_check_failed", detail: message }, { status: 502 });
  }

  const report = await postBatch(selected, newPostContext(user.id));

  const after = await postAllowance(eligible);

  return NextResponse.json({
    ok: true,
    day: range.day,
    timezone: range.timeZone,
    requested: report.requested,
    posted: report.posted,
    skipped: report.skipped,
    failed: report.failed,
    stopped: report.stopped,
    stopped_reason: report.stoppedReason,
    daily_limit: limit,
    day_used_after: after.dayUsed,
    day_remaining_after: after.dayRemaining,
    rolling_used_after: after.rollingUsed,
    rolling_remaining_after: after.rollingRemaining,
    effective_remaining_after: after.effectiveRemaining,
    // Said once for the whole run, for the same reason the single route says
    // it: acceptance is not survival.
    verified: false,
    note:
      report.stoppedReason === "ambiguous_outcome"
        ? "The batch stopped: one reply's outcome is unknown. Check YouTube before doing anything else with that row."
        : "Replies accepted by YouTube. This is not confirmation that they are live — verify after the minimum window.",
    outcomes: report.outcomes.map((o) => ({
      id: o.id,
      kind: o.kind,
      ...(o.kind === "skipped" ? { reason: o.reason } : {}),
      ...(o.kind === "posted" ? { reply_id: o.replyId, persisted: o.persisted } : {}),
      ...(o.kind === "failed" || o.kind === "ambiguous" ? { code: o.code, detail: o.detail } : {}),
    })),
  });
}
