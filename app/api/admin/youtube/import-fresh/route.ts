import { NextResponse } from "next/server";
import readXlsxFile from "read-excel-file/node";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createBatch, insertCandidates, updateBatchCounts } from "@/lib/youtube/queue";
import { MAX_UPLOAD_BYTES } from "@/lib/youtube/queue-schema";
import {
  FRESH_IMPORT_LIMIT,
  freshToCandidate,
  parseFreshMatrix,
  shortlistFreshRows,
} from "@/lib/youtube/fresh-outreach";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rate = checkRateLimit(`youtube-fresh-import:${user.id}`, 4, 10 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "missing_file" }, { status: 400 });
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: file.size === 0 ? "empty_file" : "file_too_large" }, { status: 400 });
  }

  let matrix: unknown[][];
  try {
    const parsed = await readXlsxFile(Buffer.from(await file.arrayBuffer()));
    matrix = parsed as unknown[][];
  } catch {
    return NextResponse.json({ error: "unreadable_file" }, { status: 400 });
  }

  const raw = parseFreshMatrix(matrix);
  if (!raw.length) {
    return NextResponse.json({
      error: "raw_columns_not_found",
      detail: "Expected the Colab raw export with comment_text and comment_id columns.",
    }, { status: 400 });
  }

  const shortlisted = shortlistFreshRows(raw, FRESH_IMPORT_LIMIT);
  if (!shortlisted.length) {
    return NextResponse.json({ error: "no_candidates", detail: "No high-intent outreach candidates were found." }, { status: 400 });
  }

  const batchId = await createBatch({
    label: `Fresh outreach ${new Date().toISOString().slice(0, 10)}`,
    sourceFilename: file.name.slice(0, 200),
    kind: "fresh-raw",
    importedBy: user.id,
  });

  const candidates = shortlisted.map((row, i) => freshToCandidate(row, i + 2));
  const outcome = await insertCandidates(batchId, candidates);

  await updateBatchCounts({
    batchId,
    totalRows: raw.length,
    eligibleRows: 0,
    importedRows: outcome.imported,
    skippedRows: raw.length - shortlisted.length,
    alreadyKnownRows: outcome.alreadyKnown,
    notes: `ranked ${shortlisted.length} of ${raw.length}; safe drafting happens in groups of 5`,
  });

  return NextResponse.json({
    ok: true,
    batch_id: batchId,
    raw_rows: raw.length,
    shortlisted: shortlisted.length,
    imported: outcome.imported,
    already_known: outcome.alreadyKnown,
  });
}
