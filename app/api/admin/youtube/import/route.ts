import { NextResponse } from "next/server";
import readXlsxFile from "read-excel-file/node";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseSheet, SheetFormatError, type Cell, type SheetMatrix } from "@/lib/youtube/import";
import { MAX_IMPORT_ROWS, MAX_UPLOAD_BYTES } from "@/lib/youtube/queue-schema";
import { createBatch, insertCandidates, updateBatchCounts } from "@/lib/youtube/queue";

/**
 * Imports one YouTube Questions spreadsheet into the queue.
 *
 * Importing is not approving. Eligible rows land in DRAFTED and wait for a
 * human; HOLD and SKIP rows are imported too, so the sheet's own verdicts
 * stay visible as history, in states that can never be approved.
 *
 * The upload is parsed in memory, size-capped, and read through a column
 * allow-list -- the file itself is never stored anywhere.
 */

/** The sheet the scout writes. Falls back to the first sheet if renamed. */
const PREFERRED_SHEET = "YouTube Questions";

/**
 * read-excel-file returns [{ sheet, data }] for a Buffer, and a bare matrix
 * for some inputs. Both shapes are handled so a library change in either
 * direction cannot silently produce an empty import.
 */
function selectSheet(parsed: unknown): { name: string | null; matrix: SheetMatrix } {
  if (!Array.isArray(parsed) || parsed.length === 0) return { name: null, matrix: [] };

  if (Array.isArray(parsed[0])) {
    return { name: null, matrix: parsed as SheetMatrix };
  }

  const sheets = parsed as Array<{ sheet?: unknown; data?: unknown }>;
  const named = sheets.find(
    (s) => typeof s.sheet === "string" && s.sheet.trim().toLowerCase() === PREFERRED_SHEET.toLowerCase()
  );
  const chosen = named ?? sheets[0];
  return {
    name: typeof chosen?.sheet === "string" ? chosen.sheet : null,
    matrix: Array.isArray(chosen?.data) ? (chosen.data as Cell[][]) : [],
  };
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rateLimit = checkRateLimit(`youtube-import:${user.id}`, 10, 10 * 60 * 1000);
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
    return NextResponse.json(
      { error: "file_too_large", max_bytes: MAX_UPLOAD_BYTES },
      { status: 413 }
    );
  }

  const rawLabel = form.get("label");
  const label =
    typeof rawLabel === "string" && rawLabel.trim()
      ? rawLabel.trim().slice(0, 120)
      : file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "import";

  let matrix: SheetMatrix;
  let sheetName: string | null;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const selected = selectSheet(await readXlsxFile(buffer));
    matrix = selected.matrix;
    sheetName = selected.name;
  } catch {
    return NextResponse.json({ error: "unreadable_file" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseSheet(matrix);
  } catch (error) {
    if (error instanceof SheetFormatError) {
      return NextResponse.json({ error: error.code, detail: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "unreadable_file" }, { status: 400 });
  }

  if (parsed.candidates.length === 0) {
    return NextResponse.json(
      { error: "no_rows", detail: "The sheet had a header but no usable data rows." },
      { status: 400 }
    );
  }

  // Refused before any row is written, so an oversized sheet cannot leave a
  // half-imported batch behind when the request runs out of time.
  if (parsed.candidates.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      {
        error: "too_many_rows",
        max_rows: MAX_IMPORT_ROWS,
        found: parsed.candidates.length,
        detail: "Split the sheet into smaller batches.",
      },
      { status: 413 }
    );
  }

  const batchId = await createBatch({
    label,
    sourceFilename: file.name.slice(0, 200),
    kind: "xlsx",
    importedBy: user.id,
  });

  let outcome;
  try {
    outcome = await insertCandidates(batchId, parsed.candidates);
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const eligibleRows = parsed.candidates.filter((c) => c.eligible).length;
  await updateBatchCounts({
    batchId,
    totalRows: parsed.totalRows,
    eligibleRows,
    importedRows: outcome.imported,
    skippedRows: parsed.skipped.length,
    alreadyKnownRows: outcome.alreadyKnown,
    notes: sheetName ? `sheet: ${sheetName}, header row ${parsed.headerRowIndex + 1}` : null,
  });

  return NextResponse.json({
    ok: true,
    batch_id: batchId,
    sheet: sheetName,
    header_row: parsed.headerRowIndex + 1,
    total_rows: parsed.totalRows,
    eligible_rows: eligibleRows,
    imported: outcome.imported,
    already_known: outcome.alreadyKnown,
    skipped: parsed.skipped.length,
  });
}
