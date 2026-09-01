/**
 * One-time, manual import for the reviewed 20-row YouTube recovery workbook.
 *
 * This script only inserts DRAFTED recovery attempts. It contains no approval,
 * posting, timer, retry or YouTube API path.
 *
 * Dry run:
 *   npx tsx --conditions react-server supabase/scripts/import-youtube-recovery.ts --dry-run
 *
 * Import:
 *   npx tsx --conditions react-server supabase/scripts/import-youtube-recovery.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { readSheet } from "read-excel-file/node";
import { getSupabaseAdmin } from "../../lib/supabase/server";
import {
  matchRecoveryRows,
  parseBatchCommentIds,
  parseFreshRecoverySheet,
  parseLegacyPostedReplies,
  parseLegacyRecoveryEvidence,
  RecoveryImportError,
  type RecoveryAttemptInsert,
  type RecoverySheetMatrix,
} from "../../lib/youtube/recovery";

const RECOVERY_SET = "kmate_20_fresh_replies_review_batches_2026_09_01";
const EXPECTED_FRESH_SHA256 = "42787149dd5ebb846dda9271ebacad3821634b80fcb8d7c76de0506bd680a181";
const EXPECTED_POSTED_SHA256 = "05bf7a5e8a1178e6d49239e3ea885ffe4e5bac26a6a44f9f46dcaebb98595342";
const EXPECTED_BATCH_SHA256 = "1a0f83b8eef1aaa5425043cfbdcc713a70e87ce1148fa14a8ff8b7d486c834e7";
const EXPECTED_RECOVERY_SHA256 = "7668f4bdefe98d5ed3fcc785c090dc47bd4444680071e97843399af33a9e2315";

// @saturogojo6848 has two historical replies. The passport-specific legacy
// text uniquely resolves order 17 to this reviewed parent; the other reply is
// about choosing Embassy vs University Track and is intentionally excluded.
const REVIEWED_PARENT_OVERRIDES: Readonly<Record<number, string>> = {
  17: "Ugx44VgL4TPtcncUbc14AaABAg",
};

interface Args {
  dryRun: boolean;
  workbook: string;
  posted: string;
  batch: string;
  recovery: string;
}

function parseArgs(argv: string[]): Args {
  const defaults: Args = {
    dryRun: false,
    workbook: resolve("KMate_20_Fresh_Replies_Review_Batches.xlsx"),
    posted: join(homedir(), "KMate-YouTube-Reply-Bot", "posted_replies.json"),
    batch: join(homedir(), "KMate-YouTube-Reply-Bot", "batch02.xlsx"),
    recovery: join(homedir(), "KMate-YouTube-Reply-Bot", "batch02_recovery_queue.xlsx"),
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      defaults.dryRun = true;
      continue;
    }
    if (["--workbook", "--posted", "--batch", "--recovery"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new RecoveryImportError("argument_missing", `${argument} requires a path.`);
      const key = argument.slice(2) as "workbook" | "posted" | "batch" | "recovery";
      defaults[key] = resolve(value);
      index++;
      continue;
    }
    throw new RecoveryImportError("argument_invalid", `Unknown argument: ${argument}`);
  }
  return defaults;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertFile(path: string, expectedHash: string, label: string): string {
  if (!existsSync(path)) throw new RecoveryImportError("source_missing", `${label} is missing: ${path}`);
  const actualHash = sha256(path);
  if (actualHash !== expectedHash) {
    throw new RecoveryImportError(
      "source_hash_mismatch",
      `${label} changed since review. Expected ${expectedHash}; found ${actualHash}.`
    );
  }
  return actualHash;
}

async function readMatrix(path: string, sheet: string): Promise<RecoverySheetMatrix> {
  return (await readSheet(path, sheet)) as RecoverySheetMatrix;
}

async function prepare(args: Args) {
  const hashes = {
    workbook: assertFile(args.workbook, EXPECTED_FRESH_SHA256, "Fresh workbook"),
    posted: assertFile(args.posted, EXPECTED_POSTED_SHA256, "posted_replies.json"),
    batch: assertFile(args.batch, EXPECTED_BATCH_SHA256, "batch02.xlsx"),
    recovery: assertFile(args.recovery, EXPECTED_RECOVERY_SHA256, "Recovery evidence workbook"),
  };

  const [freshMatrix, batchMatrix, recoveryMatrix] = await Promise.all([
    readMatrix(args.workbook, "20 Fresh Replies"),
    readMatrix(args.batch, "YouTube Questions"),
    readMatrix(args.recovery, "Recovery Queue"),
  ]);
  const postedRaw = JSON.parse(readFileSync(args.posted, "utf8")) as unknown;
  const matched = matchRecoveryRows({
    freshRows: parseFreshRecoverySheet(freshMatrix),
    postedRows: parseLegacyPostedReplies(postedRaw),
    recoveryEvidence: parseLegacyRecoveryEvidence(recoveryMatrix),
    batchCommentIds: parseBatchCommentIds(batchMatrix),
    reviewedParentOverrides: REVIEWED_PARENT_OVERRIDES,
  });

  const confirmedRemoved = matched.filter((row) => row.legacy_outcome === "CONFIRMED_REMOVED").length;
  const postedRecorded = matched.filter((row) => row.legacy_outcome === "POSTED_RECORDED").length;
  if (matched.length !== 20 || confirmedRemoved !== 4 || postedRecorded !== 16) {
    throw new RecoveryImportError(
      "evidence_counts_invalid",
      `Expected 20 matches with 4 CONFIRMED_REMOVED and 16 POSTED_RECORDED; found ${matched.length}/${confirmedRemoved}/${postedRecorded}.`
    );
  }

  return { hashes, matched };
}

function previewRows(rows: RecoveryAttemptInsert[]) {
  return rows.map((row) => ({
    batch: row.recovery_batch,
    order: row.recovery_order,
    author: row.author_name,
    youtube_comment_id: row.youtube_comment_id,
    legacy_reply_id: row.legacy_reply_id,
    legacy_outcome: row.legacy_outcome,
    category: row.category,
    new_recovery_draft: row.draft_text,
    recovery_status: row.status,
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { hashes, matched } = await prepare(args);

  let queueIds = new Map<string, string>();
  if (!args.dryRun) {
    loadEnvConfig(process.cwd());
    const admin = getSupabaseAdmin();
    const parentIds = matched.map((row) => row.youtube_comment_id);

    const { data: existing, error: existingError } = await admin
      .from("youtube_reply_recovery_attempts")
      .select("id, youtube_comment_id, recovery_set, recovery_order")
      .in("youtube_comment_id", parentIds);
    if (existingError) throw new Error(`Recovery duplicate preflight failed: ${existingError.message}`);
    if ((existing ?? []).length > 0) {
      throw new RecoveryImportError(
        "recovery_already_exists",
        `Refusing to overwrite ${(existing ?? []).length} existing recovery attempt(s).`
      );
    }

    const { data: queueRows, error: queueError } = await admin
      .from("youtube_reply_queue")
      .select("id, youtube_comment_id")
      .in("youtube_comment_id", parentIds);
    if (queueError) throw new Error(`Queue match preflight failed: ${queueError.message}`);
    queueIds = new Map(
      (queueRows ?? []).map((row) => [row.youtube_comment_id as string, row.id as string] as const)
    );
  }

  const inserts: RecoveryAttemptInsert[] = matched.map((row) => ({
    queue_id: queueIds.get(row.youtube_comment_id) ?? null,
    youtube_comment_id: row.youtube_comment_id,
    legacy_reply_id: row.legacy_reply_id,
    legacy_draft_text: row.legacy_draft_text,
    legacy_outcome: row.legacy_outcome,
    legacy_evidence: {
      posted_replies: {
        filename: basename(args.posted),
        sha256: hashes.posted,
        json_key: row.youtube_comment_id,
      },
      batch02: {
        filename: basename(args.batch),
        sha256: hashes.batch,
        comment_id_found: row.batch02_comment_found,
      },
      recovery_queue: {
        filename: basename(args.recovery),
        sha256: hashes.recovery,
        evidence_found: row.legacy_recovery_evidence !== null,
        recovery_status: row.legacy_recovery_evidence?.recovery_status ?? null,
        notes: row.legacy_recovery_evidence?.notes ?? null,
      },
      matching: {
        author: row.author_name,
        topic: row.topic,
        method: row.reviewed_parent_override_used ? "reviewed_parent_override" : "unique_legacy_author",
      },
      fresh_workbook: {
        filename: basename(args.workbook),
        sha256: hashes.workbook,
      },
    },
    recovery_set: RECOVERY_SET,
    author_name: row.author_name,
    recovery_batch: row.recovery_batch,
    recovery_order: row.recovery_order,
    category: row.category,
    draft_text: row.draft_text,
    status: "DRAFTED",
  }));

  if (args.dryRun) {
    console.log(JSON.stringify({ dry_run: true, rows: inserts.length, preview: previewRows(inserts) }, null, 2));
    return;
  }

  const admin = getSupabaseAdmin();
  const { data: inserted, error } = await admin
    .from("youtube_reply_recovery_attempts")
    .insert(inserts)
    .select("queue_id, youtube_comment_id, legacy_reply_id, legacy_outcome, recovery_batch, recovery_order, author_name, category, draft_text, status");
  if (error) throw new Error(`Recovery import failed: ${error.message}`);
  if ((inserted ?? []).length !== 20) {
    throw new Error(`Recovery import returned ${(inserted ?? []).length} rows instead of 20.`);
  }

  const sorted = [...(inserted ?? [])].sort(
    (left, right) => Number(left.recovery_order) - Number(right.recovery_order)
  );
  console.log(JSON.stringify({ dry_run: false, inserted: sorted.length, preview: sorted }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown recovery import error";
  console.error(message);
  process.exitCode = 1;
});
