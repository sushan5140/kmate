import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseLegacyPostedReplies, SheetFormatError } from "@/lib/youtube/import";
import { MAX_UPLOAD_BYTES } from "@/lib/youtube/queue-schema";
import { createBatch, importLegacyRecords, updateBatchCounts } from "@/lib/youtube/queue";

/**
 * One-time import of the old Python bot's posted_replies.json.
 *
 * This exists because the global unique constraint on youtube_comment_id, on
 * its own, knows nothing about comments the bot already replied to outside
 * this system. Without this import, re-importing an old spreadsheet would
 * present 120 already-answered comments as fresh work.
 *
 * Every record it touches becomes is_legacy, which the posting route refuses
 * outright regardless of status. Nothing imported here can ever be posted:
 * the point is to record that these comments were already attempted, not to
 * make them actionable.
 *
 * The distinction the direct-id audit established is preserved rather than
 * flattened. A record with a reply id becomes API_ACCEPTED -- the bot's call
 * was accepted, and that is all anyone knows until it is checked. Marking
 * them VERIFIED_LIVE on import would repeat the exact false-success that made
 * the previous run look fine while most replies were quietly gone. Running
 * verification on these rows is what sorts them into VERIFIED_LIVE and
 * REMOVED, and legacy rows bypass the minimum-age gate because they were
 * posted long before the row existed.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rateLimit = checkRateLimit(`youtube-import-legacy:${user.id}`, 5, 10 * 60 * 1000);
  if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "missing_file" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "empty_file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "file_too_large", max_bytes: MAX_UPLOAD_BYTES }, { status: 413 });
  }

  let records;
  let skipped: number;
  try {
    const parsed = parseLegacyPostedReplies(JSON.parse(await file.text()));
    records = parsed.records;
    skipped = parsed.skipped;
  } catch (error) {
    if (error instanceof SheetFormatError) {
      return NextResponse.json({ error: error.code, detail: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "unreadable_file" }, { status: 400 });
  }

  if (records.length === 0) {
    return NextResponse.json({ error: "no_rows" }, { status: 400 });
  }

  const legacySource = file.name.slice(0, 200) || "posted_replies.json";
  const batchId = await createBatch({
    label: `legacy: ${legacySource}`,
    sourceFilename: legacySource,
    kind: "legacy",
    importedBy: user.id,
  });

  let outcome;
  try {
    outcome = await importLegacyRecords(batchId, records, user.id, legacySource);
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  await updateBatchCounts({
    batchId,
    totalRows: records.length,
    eligibleRows: 0,
    importedRows: outcome.inserted,
    skippedRows: skipped,
    alreadyKnownRows: outcome.updatedExisting,
    notes: "legacy import — none of these rows is postable",
  });

  return NextResponse.json({
    ok: true,
    batch_id: batchId,
    total_records: records.length,
    inserted: outcome.inserted,
    marked_existing_legacy: outcome.updatedExisting,
    skipped,
  });
}
