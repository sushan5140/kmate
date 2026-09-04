/**
 * Read-only exact-reply-id verification for youtube_reply_recovery_attempts.
 *
 * Re-checks every stored legacy_reply_id against YouTube and records what it
 * observed. It answers exactly one question per row -- is that specific reply
 * still there -- and it is the evidence on which a recovery draft may later be
 * approved. It never approves, never sends, and never advances the workflow.
 *
 * Three YouTube calls exist in this file and nowhere else is reachable:
 *   POST oauth2.googleapis.com/token        refresh grant
 *   GET  youtube/v3/channels?mine=true      identity assertion
 *   GET  youtube/v3/comments?id=<exact>     one per row
 *
 * comments.insert / update / delete are not merely unused -- every request is
 * checked against an allow-list immediately before it is sent, so a future
 * edit cannot quietly add a write.
 *
 * Dry run (default -- reads YouTube, writes nothing):
 *   npx tsx --conditions react-server supabase/scripts/verify-youtube-recovery.ts
 *
 * Record the evidence (only legacy_outcome / legacy_evidence / updated_at):
 *   npx tsx --conditions react-server supabase/scripts/verify-youtube-recovery.ts --apply-evidence
 *
 * Credentials come from YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET /
 * YOUTUBE_REFRESH_TOKEN when all three are set, otherwise from the local bot's
 * credential files (override with --credentials / --token).
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { getSupabaseAdmin } from "../../lib/supabase/server";
import {
  EXPECTED_CHANNEL_ID,
  EXPECTED_CHANNEL_TITLE,
  assertReadOnlyRequest,
  assertWritablePatch,
  buildVerificationEvidence,
  classifyLookup,
  planRow,
  summarise,
  verifyChannel,
  type RecoveryRowForVerification,
  type RowPlan,
} from "../../lib/youtube/recovery-verify";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";
const COMMENTS_ENDPOINT = "https://www.googleapis.com/youtube/v3/comments";

/** Spacing between lookups. Courtesy on a read path, not evasion. */
const REQUEST_SPACING_MS = 150;

class VerifyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "VerifyError";
  }
}

interface Args {
  applyEvidence: boolean;
  credentials: string;
  token: string;
}

function parseArgs(argv: string[]): Args {
  const defaults: Args = {
    applyEvidence: false,
    credentials: join(homedir(), "KMate-YouTube-Reply-Bot", "credentials.json"),
    token: join(homedir(), "KMate-YouTube-Reply-Bot", "token.json"),
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--apply-evidence") {
      defaults.applyEvidence = true;
      continue;
    }
    if (argument === "--dry-run") {
      // Accepted for symmetry with the importer; dry run is already the default.
      defaults.applyEvidence = false;
      continue;
    }
    if (argument === "--credentials" || argument === "--token") {
      const value = argv[index + 1];
      if (!value) throw new VerifyError("argument_missing", `${argument} requires a path.`);
      defaults[argument.slice(2) as "credentials" | "token"] = resolve(value);
      index++;
      continue;
    }
    throw new VerifyError("argument_invalid", `Unknown argument: ${argument}`);
  }

  return defaults;
}

/** Every outbound request passes through here, so the allow-list cannot be bypassed. */
async function readOnlyFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  assertReadOnlyRequest(url, method);
  return fetch(url, { ...init, method, cache: "no-store" });
}

/**
 * An access token, from the environment when configured and otherwise from the
 * local bot files. Secrets are read, used, and never printed or returned.
 */
async function accessToken(args: Args): Promise<string> {
  let clientId = process.env.YOUTUBE_CLIENT_ID;
  let clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  let refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  let source = "environment";

  if (!clientId || !clientSecret || !refreshToken) {
    if (!existsSync(args.token)) {
      throw new VerifyError(
        "credentials_missing",
        `Set YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN, or provide --token (looked for ${args.token}).`
      );
    }
    const token = JSON.parse(readFileSync(args.token, "utf8")) as Record<string, string>;
    const app = existsSync(args.credentials)
      ? ((JSON.parse(readFileSync(args.credentials, "utf8")) as Record<string, Record<string, string>>)
          .installed ?? {})
      : {};
    clientId = token.client_id ?? app.client_id;
    clientSecret = token.client_secret ?? app.client_secret;
    refreshToken = token.refresh_token;
    source = "local credential files";
  }

  if (!clientId || !clientSecret || !refreshToken) {
    throw new VerifyError("credentials_incomplete", `Incomplete OAuth material from ${source}.`);
  }

  const response = await readOnlyFetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    // Google's body can echo request parameters; read the short code only.
    let slug = `http_${response.status}`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string") slug = body.error;
    } catch {
      // A non-JSON body tells us nothing safe to surface.
    }
    throw new VerifyError("oauth_failed", `Google refused the refresh token (${slug}).`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new VerifyError("oauth_failed", "No access token returned.");
  console.log(`  credentials: ${source}`);
  return payload.access_token;
}

/** Aborts unless the credentials own the expected channel. */
async function assertChannel(token: string): Promise<string> {
  const response = await readOnlyFetch(`${CHANNELS_ENDPOINT}?part=id,snippet&mine=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new VerifyError("channel_check_failed", `channels.list returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as {
    items?: Array<{ id?: string; snippet?: { title?: string } }>;
  };
  const item = payload.items?.[0];
  const verdict = verifyChannel({ id: item?.id ?? null, title: item?.snippet?.title ?? null });

  if (!verdict.ok) {
    throw new VerifyError(
      "channel_mismatch",
      verdict.reason === "no_channel"
        ? "channels.list returned no channel for these credentials."
        : `Authenticated channel is ${verdict.id}, expected ${EXPECTED_CHANNEL_ID}. Aborting.`
    );
  }

  console.log(`  channel: ${verdict.title} (${verdict.id})`);
  if (!verdict.titleMatches) {
    console.log(`  NOTE: title is "${verdict.title}", expected "${EXPECTED_CHANNEL_TITLE}" — id matched, continuing`);
  }
  return verdict.id;
}

/** One exact-id existence check. Never throws; transport failures classify. */
async function lookup(token: string, legacyReplyId: string) {
  const url = `${COMMENTS_ENDPOINT}?part=id,snippet&textFormat=plainText&id=${encodeURIComponent(legacyReplyId)}`;
  try {
    const response = await readOnlyFetch(url, { headers: { Authorization: `Bearer ${token}` } });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return classifyLookup({ status: response.status, body });
  } catch (error) {
    return classifyLookup({
      status: 0,
      body: null,
      networkError: error instanceof Error ? error.message : "unknown",
    });
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const args = parseArgs(process.argv.slice(2));

  console.log(`=== YouTube recovery verification (${args.applyEvidence ? "APPLY EVIDENCE" : "DRY RUN"}) ===`);

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("youtube_reply_recovery_attempts")
    .select("recovery_order, legacy_reply_id, legacy_outcome, legacy_evidence, status")
    .order("recovery_order", { ascending: true });
  if (error) throw new VerifyError("db_read_failed", `Could not read recovery attempts: ${error.message}`);

  const rows = (data ?? []) as RecoveryRowForVerification[];
  if (rows.length === 0) throw new VerifyError("no_rows", "No recovery attempts to verify.");
  console.log(`  rows: ${rows.length}`);

  const token = await accessToken(args);
  const channelId = await assertChannel(token);

  console.log("=== per-row exact-id lookups ===");
  const plans: RowPlan[] = [];
  for (const row of rows) {
    const classification = await lookup(token, row.legacy_reply_id);
    const plan = planRow(row, classification);
    plans.push(plan);

    const flag = plan.result === "STILL_LIVE" ? "  <<< STILL LIVE" : "";
    const move = plan.upgrades ? `  ${plan.previousOutcome} -> ${plan.nextOutcome}` : "";
    console.log(
      `  #${String(plan.order).padStart(2)}  ${plan.legacyReplyId}  ${plan.result} (${plan.detail})${move}${flag}`
    );
    await new Promise((r) => setTimeout(r, REQUEST_SPACING_MS));
  }

  const summary = summarise(plans);
  console.log("=== summary ===");
  console.log(`  checked:            ${summary.checked}`);
  console.log(`  CONFIRMED_REMOVED:  ${summary.confirmedRemoved}`);
  console.log(`  STILL_LIVE:         ${summary.stillLive}`);
  console.log(`  API_ERROR:          ${summary.apiError}`);
  console.log(`  AMBIGUOUS:          ${summary.ambiguous}`);
  console.log(`  would upgrade:      ${summary.wouldUpgrade}`);
  console.log(`  contradictions:     ${summary.contradictions}`);
  for (const plan of plans.filter((p) => p.previousOutcome === "CONFIRMED_REMOVED" && p.result === "STILL_LIVE")) {
    console.log(`    CONTRADICTION #${plan.order}: stored as removed but the API says it is live`);
  }

  if (!args.applyEvidence) {
    console.log("=== DRY RUN — no database write attempted ===");
    return;
  }

  console.log("=== applying evidence (legacy_outcome / legacy_evidence / updated_at only) ===");
  let written = 0;
  let upgraded = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const plan = plans[index];
    const now = new Date().toISOString();

    const patch: Record<string, unknown> = {
      legacy_outcome: plan.nextOutcome,
      legacy_evidence: buildVerificationEvidence(row.legacy_evidence, {
        result: plan.result,
        checkedAt: now,
        channelId,
      }),
      updated_at: now,
    };
    // Belt and braces: refuse the write if it ever grows a forbidden column.
    assertWritablePatch(patch);

    const { error: writeError } = await admin
      .from("youtube_reply_recovery_attempts")
      .update(patch)
      .eq("recovery_order", row.recovery_order);
    if (writeError) throw new VerifyError("db_write_failed", `Row ${row.recovery_order}: ${writeError.message}`);

    written++;
    if (plan.upgrades) upgraded++;
  }
  console.log(`  evidence written: ${written}`);
  console.log(`  outcomes upgraded to CONFIRMED_REMOVED: ${upgraded}`);
  console.log("  status, posted_reply_id, api_accepted_at, attempt_count: untouched");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown verification error");
  process.exitCode = 1;
});
