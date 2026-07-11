/**
 * Idempotent re-runnable seed for the mistake_entries table, from
 * data/gks-mistakes-seed-data.md (a curated research doc with a JSON code
 * block of GKS application-mistake findings). Re-run after refreshing that
 * file with a new research pass rather than hand-editing the database.
 *
 * Usage: npm run seed:mistakes
 */
import { readFileSync } from "fs";
import { join } from "path";
import { getSupabaseAdmin } from "../../lib/supabase/server";
import {
  MISTAKE_DOCUMENT_TYPES,
  MISTAKE_REASON_CATEGORIES,
  SOURCE_PLATFORMS,
  CONFIDENCE_LEVELS,
  type MistakeDocumentType,
  type MistakeReasonCategory,
  type SourcePlatform,
  type Confidence,
} from "../../lib/constants";

interface SeedEntry {
  title: string;
  description: string;
  document_type: MistakeDocumentType;
  reason_category: MistakeReasonCategory;
  source_platform: SourcePlatform;
  source_url: string;
  confidence: Confidence;
}

function loadEntries(): SeedEntry[] {
  const filePath = join(__dirname, "..", "..", "data", "gks-mistakes-seed-data.md");
  const text = readFileSync(filePath, "utf8");
  const match = text.match(/```json\s*(\[[\s\S]*?\])\s*```/);
  if (!match) throw new Error("No JSON code block found in gks-mistakes-seed-data.md");
  const entries = JSON.parse(match[1]) as SeedEntry[];

  for (const [i, e] of entries.entries()) {
    if (!MISTAKE_DOCUMENT_TYPES.includes(e.document_type)) {
      throw new Error(`Entry ${i} ("${e.title}") has unknown document_type: ${e.document_type}`);
    }
    if (!MISTAKE_REASON_CATEGORIES.includes(e.reason_category)) {
      throw new Error(`Entry ${i} ("${e.title}") has unknown reason_category: ${e.reason_category}`);
    }
    if (!SOURCE_PLATFORMS.includes(e.source_platform)) {
      throw new Error(`Entry ${i} ("${e.title}") has unknown source_platform: ${e.source_platform}`);
    }
    if (!CONFIDENCE_LEVELS.includes(e.confidence)) {
      throw new Error(`Entry ${i} ("${e.title}") has unknown confidence: ${e.confidence}`);
    }
  }

  return entries;
}

async function main() {
  const admin = getSupabaseAdmin();
  const entries = loadEntries();

  const { data: existing, error: existingErr } = await admin.from("mistake_entries").select("title");
  if (existingErr) {
    console.error("Failed to read existing mistake_entries:", existingErr);
    process.exit(1);
  }
  const existingTitles = new Set((existing ?? []).map((r) => r.title));

  const rows = entries
    .filter((e) => !existingTitles.has(e.title))
    .map((e) => ({
      title: e.title,
      description: e.description,
      document_type: e.document_type,
      reason_category: e.reason_category,
      source_platform: e.source_platform,
      source_url: e.source_url,
      confidence: e.confidence,
      submitted_by: null,
      status: "approved" as const,
    }));

  if (rows.length === 0) {
    console.log(`Nothing to insert -- all ${entries.length} entries already present.`);
    return;
  }

  const { error: insertErr } = await admin.from("mistake_entries").insert(rows);
  if (insertErr) {
    console.error("Insert failed:", insertErr);
    process.exit(1);
  }

  console.log(`Seeded ${rows.length} new mistake entries (${entries.length - rows.length} already existed, skipped).`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
