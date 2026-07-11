/**
 * Idempotent re-runnable seed for the eca_entries table, from
 * data/gks-extracurriculars-seed-data.md (a curated research doc with a JSON
 * code block of GKS extracurricular/profile-building findings). Re-run after
 * refreshing that file with a new research pass rather than hand-editing the
 * database.
 *
 * Usage: npm run seed:eca
 */
import { readFileSync } from "fs";
import { join } from "path";
import { getSupabaseAdmin } from "../../lib/supabase/server";
import {
  ECA_TRACKS,
  ECA_ACTIVITY_TYPES,
  ECA_IMPACT_AREAS,
  SOURCE_PLATFORMS,
  CONFIDENCE_LEVELS,
  type EcaTrack,
  type EcaActivityType,
  type EcaImpactArea,
  type SourcePlatform,
  type Confidence,
} from "../../lib/constants";

interface SeedEntry {
  title: string;
  description: string;
  target_track: EcaTrack;
  activity_type: EcaActivityType;
  impact_area: EcaImpactArea;
  source_platform: SourcePlatform;
  source_url: string;
  confidence: Confidence;
}

function loadEntries(): SeedEntry[] {
  const filePath = join(__dirname, "..", "..", "data", "gks-extracurriculars-seed-data.md");
  const text = readFileSync(filePath, "utf8");
  const match = text.match(/```json\s*(\[[\s\S]*?\])\s*```/);
  if (!match) throw new Error("No JSON code block found in gks-extracurriculars-seed-data.md");
  const entries = JSON.parse(match[1]) as SeedEntry[];

  for (const [i, e] of entries.entries()) {
    if (!ECA_TRACKS.includes(e.target_track)) {
      throw new Error(`Entry ${i} ("${e.title}") has unknown target_track: ${e.target_track}`);
    }
    if (!ECA_ACTIVITY_TYPES.includes(e.activity_type)) {
      throw new Error(`Entry ${i} ("${e.title}") has unknown activity_type: ${e.activity_type}`);
    }
    if (!ECA_IMPACT_AREAS.includes(e.impact_area)) {
      throw new Error(`Entry ${i} ("${e.title}") has unknown impact_area: ${e.impact_area}`);
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

  const { data: existing, error: existingErr } = await admin.from("eca_entries").select("title");
  if (existingErr) {
    console.error("Failed to read existing eca_entries:", existingErr);
    process.exit(1);
  }
  const existingTitles = new Set((existing ?? []).map((r) => r.title));

  const rows = entries
    .filter((e) => !existingTitles.has(e.title))
    .map((e) => ({
      title: e.title,
      description: e.description,
      track: e.target_track,
      activity_type: e.activity_type,
      impact_area: e.impact_area,
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

  const { error: insertErr } = await admin.from("eca_entries").insert(rows);
  if (insertErr) {
    console.error("Insert failed:", insertErr);
    process.exit(1);
  }

  console.log(`Seeded ${rows.length} new ECA entries (${entries.length - rows.length} already existed, skipped).`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
