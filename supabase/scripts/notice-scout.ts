/**
 * Official notice scout -- server-side CLI.
 *
 * Run with:  npx tsx --conditions react-server supabase/scripts/notice-scout.ts
 *            npx tsx --conditions react-server supabase/scripts/notice-scout.ts --skip-discovery
 *
 * Refreshes the Study in Korea notice index, then queues anything unseen for
 * human review. It cannot publish: the furthest a notice travels here is
 * status 'pending_review'.
 *
 * --skip-discovery re-runs only the classify/queue stage over what is already
 * indexed, which is the useful mode after changing classification rules --
 * no traffic is sent to the government site at all.
 *
 * There is no URL argument by design. The only pages fetched are the ones
 * registered in public.sources, and every notice is re-checked against that
 * source's official_domain before it can be queued.
 */
import { loadEnvLocal } from "./regression/_env";

const env = loadEnvLocal();
process.env.NEXT_PUBLIC_SUPABASE_URL ??= env.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY ??= env.SUPABASE_SERVICE_ROLE_KEY;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function main() {
  const skipDiscovery = process.argv.includes("--skip-discovery");
  const { runNoticeScout, formatScoutSummary } = await import("../../lib/notices/scout");

  console.log(`[notice-scout] starting${skipDiscovery ? " (queue stage only)" : ""}…`);
  const result = await runNoticeScout({ skipDiscovery });

  console.log("");
  console.log("  listed on board       " + result.listed);
  console.log("  newly discovered      " + result.newlyDiscovered);
  console.log("  content changed       " + result.contentChanged);
  console.log("  considered for queue  " + result.discovered);
  console.log("  queued for review     " + result.queued);
  console.log("  skipped (known)       " + result.skippedKnown);
  console.log("  parse failures        " + result.parseFailures.length);
  console.log("  errors                " + result.errors.length);

  for (const f of result.parseFailures) console.log(`    parse failure: ${f.sourceUrl} -- ${f.reason}`);
  for (const e of result.errors) console.log(`    error: ${e}`);

  console.log("");
  console.log(formatScoutSummary(result));

  // A run that reached the end is a success even with per-item failures --
  // that is the point of the per-item boundary. Only a stage-level error
  // (which leaves result.errors populated with no work done) is worth a
  // non-zero exit for CI.
  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[notice-scout] fatal:", e);
  process.exit(1);
});
