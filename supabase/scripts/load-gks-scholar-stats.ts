/**
 * Idempotent re-runnable load for GKS scholar placement statistics (2026
 * Final Round) into gks_university_stats / gks_country_stats /
 * gks_university_country_stats, from the three data/gks-scholar-*.json
 * files. Those were derived from NIIED's official successful-candidate PDFs
 * (Embassy track, University track, combined Final Round list per track),
 * cross-matched by Candidate Number, and validated row-for-row against an
 * independently-computed aggregate before being committed -- see the git
 * history for that verification. Re-run this after regenerating the JSON
 * files from a newer year's PDFs, same as seed-universities.ts.
 *
 * Usage: npx tsx supabase/scripts/load-gks-scholar-stats.ts
 */
import fs from "node:fs";
import path from "node:path";

// tsx doesn't auto-load .env.local the way `next dev`/`next build` do --
// same reasoning as supabase/scripts/regression/_env.ts's loadEnvLocal().
const envPath = path.join(__dirname, "..", "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

import universityStats from "../../data/gks-scholar-university-stats.json";
import countryStats from "../../data/gks-scholar-country-stats.json";
import universityCountryStats from "../../data/gks-scholar-university-country-stats.json";
import { getSupabaseAdmin } from "../../lib/supabase/server";

async function main() {
  const admin = getSupabaseAdmin();

  const { error: uniError, count: uniCount } = await admin
    .from("gks_university_stats")
    .upsert(universityStats, { onConflict: "track,university", count: "exact" });
  if (uniError) throw new Error(`gks_university_stats upsert failed: ${uniError.message}`);

  const { error: countryError, count: countryCount } = await admin
    .from("gks_country_stats")
    .upsert(countryStats, { onConflict: "track,country", count: "exact" });
  if (countryError) throw new Error(`gks_country_stats upsert failed: ${countryError.message}`);

  // Upsert in batches -- 1186 rows in one request risks hitting PostgREST's
  // payload/row limits, unlike the two much smaller tables above.
  const BATCH_SIZE = 500;
  let crossTabCount = 0;
  for (let i = 0; i < universityCountryStats.length; i += BATCH_SIZE) {
    const batch = universityCountryStats.slice(i, i + BATCH_SIZE);
    const { error } = await admin.from("gks_university_country_stats").upsert(batch, { onConflict: "track,university,country" });
    if (error) throw new Error(`gks_university_country_stats upsert failed at batch ${i}: ${error.message}`);
    crossTabCount += batch.length;
  }

  console.log(`Loaded ${uniCount ?? universityStats.length} university-stat rows.`);
  console.log(`Loaded ${countryCount ?? countryStats.length} country-stat rows.`);
  console.log(`Loaded ${crossTabCount} university-country cross-tab rows.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
