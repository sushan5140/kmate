/**
 * Recovery resolver, retry and audit-trail checks.
 *
 * Run with:
 *   npx tsx --conditions react-server supabase/scripts/regression/youtube-recovery-resolve-checks.ts
 *
 * Drives the real orchestrators (executeStuckResolution, executeRetryAuthorization)
 * with fake I/O, so every refusal path is exercised as written. A network trap
 * is installed before the first test: any real request throws and is counted.
 *
 * Two properties under test.
 *
 * The resolver may conclude "this posted" only from evidence strong enough
 * that being wrong is implausible -- right parent, right channel, exact text,
 * consistent timing, exactly one candidate. Everything else leaves the row
 * blocked for a human, because both wrong answers are expensive: a false
 * "posted" loses a reply forever, a false "not posted" invites a duplicate.
 *
 * The retry may only ever apply to a DEFINITE failure. An unknown outcome is
 * excluded structurally -- it leaves the row in POSTING, and this path only
 * accepts FAILED -- and again by its stored note and its event history.
 */
import { readFileSync } from "node:fs";
import {
  RECOVERY_RESOLVE_REFUSAL_TEXT,
  RESOLVE_TIME_SKEW_MS,
  decideResolution,
  executeStuckResolution,
  judgeCandidate,
  readCandidate,
  resolveRefusal,
  type ResolveDeps,
  type StuckRow,
} from "@/lib/youtube/recovery-resolve";
import {
  RECOVERY_RETRY_REFUSAL_TEXT,
  RETRY_FROM_STATUS,
  RETRY_TO_STATUS,
  UNKNOWN_OUTCOME_MARKER,
  canRetryRecovery,
  executeRetryAuthorization,
  retryRefusal,
  type RetryDeps,
  type RetryRow,
} from "@/lib/youtube/recovery-retry";
import { RECOVERY_MAX_TOTAL_ATTEMPTS, buildFailureNote } from "@/lib/youtube/recovery-send";
import {
  ALLOWED_EVENT_METADATA_KEYS,
  RECOVERY_EVENT_TYPES,
  UnsafeEventMetadataError,
  sanitiseEventMetadata,
} from "@/lib/youtube/recovery-events";
import {
  canConfirmRecovery,
  classifyConfirmation,
  confirmRefusal,
  executeConfirmation,
  type ConfirmDeps,
  type ConfirmRow,
} from "@/lib/youtube/recovery-confirm";
import { EXPECTED_CHANNEL_ID } from "@/lib/youtube/recovery-verify";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + m);
  if (!c) fail++;
};

const NEWLINE = String.fromCharCode(10);
/** Code only. A test that forbids MENTIONING a term would punish good docs. */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(NEWLINE)
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*");
    })
    .join(NEWLINE);

/** Any real network call from this suite throws and is counted. */
let networkCalls = 0;
globalThis.fetch = ((...args: unknown[]) => {
  networkCalls++;
  throw new Error("REGRESSION BUG: real network call attempted: " + String(args[0]));
}) as typeof globalThis.fetch;

const DRAFT = "The exact approved wording, and nothing else.";
const PARENT = "parent-comment-id";
const CLAIMED_AT = "2026-09-04T10:00:00.000Z";
const NOW = Date.parse("2026-09-04T10:05:00.000Z");

const stuck = (over: Partial<StuckRow> = {}): StuckRow => ({
  id: "row-1",
  status: "POSTING",
  youtube_comment_id: PARENT,
  draft_text: DRAFT,
  posted_reply_id: null,
  attempt_count: 1,
  last_attempt_at: CLAIMED_AT,
  ...over,
});

/** A YouTube reply item that SHOULD resolve. Each test breaks one field. */
const apiReply = (over: Record<string, unknown> = {}, snippetOver: Record<string, unknown> = {}) => ({
  id: "found-reply-id",
  snippet: {
    parentId: PARENT,
    authorChannelId: { value: EXPECTED_CHANNEL_ID },
    textOriginal: DRAFT,
    publishedAt: "2026-09-04T10:00:30.000Z",
    ...snippetOver,
  },
  ...over,
});

interface ResolveHarness {
  deps: ResolveDeps;
  marked: Array<{ id: string; replyId: string; at: string }>;
  events: Array<{ resolved: boolean; reason: string | null; replyId: string | null; examined: number; matched: number }>;
  state: StuckRow;
}

function resolveHarness(
  options: {
    start?: Partial<StuckRow>;
    listing?:
      | { ok: true; items: unknown; truncated?: boolean; pages?: number }
      | { ok: false; reason: "api_error" | "malformed_response" };
    channel?: { id: string | null; title: string | null };
    markFails?: boolean;
    missing?: boolean;
  } = {}
): ResolveHarness {
  const h: ResolveHarness = {
    marked: [],
    events: [],
    state: stuck(options.start),
    deps: null as unknown as ResolveDeps,
  };
  h.deps = {
    async loadRow() {
      return options.missing ? null : { ...h.state };
    },
    async authenticatedChannel() {
      return options.channel ?? { id: EXPECTED_CHANNEL_ID, title: "Sushan" };
    },
    async listReplies() {
      const listing = options.listing ?? { ok: true as const, items: [apiReply()] };
      return listing.ok
        ? { ok: true as const, items: listing.items, truncated: listing.truncated ?? false, pages: listing.pages ?? 1 }
        : listing;
    },
    async markAccepted(id, replyId, at) {
      if (options.markFails) return false;
      h.marked.push({ id, replyId, at });
      h.state = { ...h.state, status: "API_ACCEPTED", posted_reply_id: replyId };
      return true;
    },
    async recordEvent(input) {
      h.events.push({
        resolved: input.resolved,
        reason: input.reason,
        replyId: input.replyId,
        examined: input.examined,
        matched: input.matched,
      });
    },
    now: () => NOW,
  };
  return h;
}

const retryRow = (over: Partial<RetryRow> = {}): RetryRow => ({
  id: "row-1",
  status: "FAILED",
  legacy_outcome: "CONFIRMED_REMOVED",
  legacy_reply_id: "legacy-reply-id",
  posted_reply_id: null,
  attempt_count: 1,
  last_error: "[t] commentNotFound (http 404): The parent comment could not be found.",
  ...over,
});

interface RetryHarness {
  deps: RetryDeps;
  authorized: number;
  events: Array<{ reason: string | null; previousAttemptCount: number; previousError: string | null }>;
  state: RetryRow;
}

function retryHarness(
  options: {
    start?: Partial<RetryRow>;
    lookup?: { status: number; body: unknown; networkError?: string };
    channel?: { id: string | null; title: string | null };
    evidence?: "clear" | "unresolved" | "unavailable";
    authorizeFails?: boolean;
    missing?: boolean;
  } = {}
): RetryHarness {
  const h: RetryHarness = {
    authorized: 0,
    events: [],
    state: retryRow(options.start),
    deps: null as unknown as RetryDeps,
  };
  h.deps = {
    async loadRow() {
      return options.missing ? null : { ...h.state };
    },
    async ambiguityEvidence() {
      return options.evidence ?? "clear";
    },
    async authenticatedChannel() {
      return options.channel ?? { id: EXPECTED_CHANNEL_ID, title: "Sushan" };
    },
    async lookupReply() {
      return options.lookup ?? { status: 200, body: { items: [] } };
    },
    async authorize(id, expect) {
      if (options.authorizeFails) return false;
      if (h.state.status !== expect.status || h.state.attempt_count !== expect.attemptCount) return false;
      h.authorized++;
      h.state = { ...h.state, status: RETRY_TO_STATUS };
      return true;
    },
    async recordEvent(input) {
      h.events.push({ ...input });
    },
  };
  return h;
}

async function main() {
console.log("=== 1. the event vocabulary ===");
for (const type of [
  "RECOVERY_SEND_REQUESTED",
  "RECOVERY_FRESH_VERIFICATION_PASSED",
  "RECOVERY_FRESH_VERIFICATION_BLOCKED",
  "RECOVERY_POST_CLAIMED",
  "RECOVERY_API_ACCEPTED",
  "RECOVERY_API_REJECTED",
  "RECOVERY_OUTCOME_UNKNOWN",
  "RECOVERY_STUCK_RESOLVED",
  "RECOVERY_RETRY_AUTHORIZED",
]) {
  ok((RECOVERY_EVENT_TYPES as readonly string[]).includes(type), type + " is a recorded event type");
}
{
  const migrationRaw = readFileSync("supabase/migrations/20260904120000_youtube_reply_recovery_events.sql", "utf8");
  // SQL statements only. The file explains WHY the revoke is needed, and a
  // scan that reads the explanation as a grant would punish the explanation.
  const migration = migrationRaw
    .split(NEWLINE)
    .filter((line) => !line.trim().startsWith("--"))
    .join(NEWLINE);
  for (const type of RECOVERY_EVENT_TYPES) {
    ok(migration.includes("'" + type + "'"), "the table CHECK permits " + type);
  }
  ok(/enable row level security/.test(migration), "RLS is enabled on the events table");
  ok(
    /revoke all on public\.youtube_reply_recovery_events from public, anon, authenticated/.test(migration),
    "anon and authenticated are revoked -- service-role only"
  );
  ok(
    /grant select, insert on public\.youtube_reply_recovery_events to service_role/.test(migration),
    "the grant is select+insert only: append-only is enforced, not merely intended"
  );
  ok(!/grant[^;]*update[^;]*youtube_reply_recovery_events/i.test(migration), "no update grant");
  // Supabase's default privileges hand service_role full DML on new tables, so
  // a bare grant is additive. The revoke is what actually makes it append-only.
  ok(
    /revoke update, delete, truncate on public\.youtube_reply_recovery_events from service_role/.test(migration),
    "UPDATE/DELETE/TRUNCATE are explicitly revoked from service_role"
  );
  ok(!/grant[^;]*delete[^;]*youtube_reply_recovery_events/i.test(migration), "no delete grant");
  ok(
    /references public\.youtube_reply_recovery_attempts\(id\)/.test(migration),
    "events are keyed to the recovery attempt, not to the outreach queue"
  );
  const schema = readFileSync("supabase/schema.sql", "utf8");
  ok(schema.includes("public.youtube_reply_recovery_events"), "schema.sql carries the same table");
}

console.log("=== 2. event metadata cannot carry secrets ===");
{
  ok(
    JSON.stringify(sanitiseEventMetadata({ parent_comment_id: PARENT, result: "ok" })) ===
      JSON.stringify({ parent_comment_id: PARENT, result: "ok" }),
    "allowed keys pass through"
  );
  let threw = false;
  try {
    sanitiseEventMetadata({ access_token: "secret" });
  } catch (error) {
    threw = error instanceof UnsafeEventMetadataError;
  }
  ok(threw, "an unexpected key throws rather than being silently dropped");

  for (const value of ["ya29.a0AfH6", "1//0abcdefg", "-----BEGIN PRIVATE KEY-----", "Bearer abc123"]) {
    let caught = false;
    try {
      sanitiseEventMetadata({ detail: value });
    } catch (error) {
      caught = error instanceof UnsafeEventMetadataError;
    }
    ok(caught, "a secret-shaped value is refused even under an allowed key: " + value.slice(0, 12));
  }
  ok(
    !(ALLOWED_EVENT_METADATA_KEYS as readonly string[]).some((k) => /token|secret|password|key$/i.test(k)),
    "no allowed metadata key is credential-shaped"
  );
}

console.log("=== 3. resolver: exactly one matching reply resolves ===");
{
  const h = resolveHarness();
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(out.ok === true, "one confident match resolves");
  ok(out.ok && out.postedReplyId === "found-reply-id", "the found reply id is recorded");
  ok(out.ok && out.apiAcceptedAt === "2026-09-04T10:00:30.000Z", "api_accepted_at is YouTube's publishedAt, not invented");
  ok(h.marked.length === 1, "the row was marked accepted exactly once");
  ok(h.state.status === "API_ACCEPTED", "and lands in API_ACCEPTED");
  ok(h.events.length === 1 && h.events[0].resolved, "a resolution event was recorded");
  ok(h.events[0].examined === 1 && h.events[0].matched === 1, "the event records what was examined");
}

console.log("=== 4. resolver: zero matches does NOT resolve ===");
{
  const h = resolveHarness({ listing: { ok: true, items: [] } });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(!out.ok && out.reason === "no_match", "an empty reply list refuses with no_match");
  ok(h.marked.length === 0, "nothing was written");
  ok(h.state.status === "POSTING", "the row stays POSTING for a human");
  ok(h.events[0] && !h.events[0].resolved, "an unresolved event was recorded");
}

console.log("=== 5. resolver: two matches is ambiguous, no state change ===");
{
  const h = resolveHarness({
    listing: { ok: true, items: [apiReply(), apiReply({ id: "second-reply-id" })] },
  });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(!out.ok && out.reason === "multiple_matches", "two identical matches refuse with multiple_matches");
  ok(h.marked.length === 0, "neither candidate was adopted");
  ok(h.state.status === "POSTING", "the row is unchanged");
  ok(h.events[0].matched === 2, "the event records that two matched");
}

console.log("=== 6. resolver: each individual condition is necessary ===");
for (const [label, item] of [
  ["wrong author channel", apiReply({}, { authorChannelId: { value: "UCsomeoneElse00000000" } })],
  ["missing author channel", apiReply({}, { authorChannelId: undefined })],
  ["wrong text", apiReply({}, { textOriginal: "A different reply entirely." })],
  ["text differing by one character", apiReply({}, { textOriginal: DRAFT + " " })],
  ["wrong parent", apiReply({}, { parentId: "some-other-parent" })],
  ["no reply id", apiReply({ id: undefined })],
  ["published before the attempt", apiReply({}, { publishedAt: "2026-09-01T08:00:00.000Z" })],
  ["no publish time", apiReply({}, { publishedAt: undefined })],
  ["unreadable publish time", apiReply({}, { publishedAt: "not a date" })],
] as const) {
  const h = resolveHarness({ listing: { ok: true, items: [item] } });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(!out.ok && out.reason === "no_match", label + " -> not a match");
  ok(h.marked.length === 0, label + " -> nothing written");
}
{
  // The realistic danger: the ORIGINAL 2026 bot reply, still under this very
  // parent, with this very text. Only the timing separates them.
  const legacyLookalike = apiReply({ id: "legacy-bot-reply" }, { publishedAt: "2026-08-15T12:00:00.000Z" });
  const h = resolveHarness({ listing: { ok: true, items: [legacyLookalike] } });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(!out.ok && out.reason === "no_match", "an old identical reply from the previous bot run is NOT adopted");
}
{
  // One good candidate beside several bad ones still resolves.
  const h = resolveHarness({
    listing: {
      ok: true,
      items: [
        apiReply({ id: "other" }, { authorChannelId: { value: "UCotherperson0000000" } }),
        apiReply({ id: "old" }, { publishedAt: "2026-08-15T12:00:00.000Z" }),
        apiReply(),
      ],
    },
  });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(out.ok === true, "one valid candidate among distractors resolves");
  ok(out.ok && out.postedReplyId === "found-reply-id", "and it is the right one");
  ok(h.events[0].examined === 3 && h.events[0].matched === 1, "the event records 3 examined, 1 matched");
}

console.log("=== 7. resolver: fails closed on API trouble ===");
const failedListings: Array<[string, { ok: false; reason: "api_error" | "malformed_response" }]> = [
  ["an API error", { ok: false, reason: "api_error" }],
  ["a malformed response", { ok: false, reason: "malformed_response" }],
];
for (const [label, listing] of failedListings) {
  const h = resolveHarness({ listing });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(!out.ok && out.reason === listing.reason, label + " refuses with " + listing.reason);
  ok(h.marked.length === 0, label + " changes nothing");
  ok(h.state.status === "POSTING", label + " leaves the row stuck");
}
{
  const h = resolveHarness({ listing: { ok: true, items: "not an array" as unknown as unknown[] } });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(!out.ok && out.reason === "malformed_response", "a non-array items field is malformed_response");
}
for (const [label, channel] of [
  ["a different channel", { id: "UCsomeoneElse00000000", title: "Someone" }],
  ["no channel", { id: null, title: null }],
] as const) {
  const h = resolveHarness({ channel });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(!out.ok && out.reason === "channel_mismatch", label + " aborts the resolution");
  ok(h.marked.length === 0, label + " changes nothing");
}

console.log("=== 8. resolver: only stuck rows, and the write is guarded ===");
for (const status of ["APPROVED", "DRAFTED", "SKIP", "FAILED", "API_ACCEPTED", "VERIFIED_LIVE"]) {
  const h = resolveHarness({ start: { status } });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(!out.ok && out.reason === "not_stuck", status + " cannot be resolved");
}
{
  const h = resolveHarness({ start: { posted_reply_id: "already" } });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(!out.ok && out.reason === "already_posted", "a row with a reply id is not resolvable");
}
{
  const h = resolveHarness({ start: { last_attempt_at: null } });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(!out.ok && out.reason === "no_attempt_time", "no claim time means no window to judge against");
  ok(h.marked.length === 0, "and nothing is adopted");
}
{
  const h = resolveHarness({ markFails: true });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(!out.ok && out.reason === "not_stuck", "a guarded write that does not apply is reported, not ignored");
}
{
  const h = resolveHarness({ missing: true });
  const out = await executeStuckResolution(h.deps, "nope");
  ok(!out.ok && out.httpStatus === 404, "a missing row is 404");
}

console.log("=== 9. resolver internals ===");
{
  const judged = judgeCandidate(
    { id: "x", parentId: PARENT, authorChannelId: EXPECTED_CHANNEL_ID, textOriginal: DRAFT, publishedAt: "2026-09-04T10:00:30.000Z" },
    stuck(),
    Date.parse(CLAIMED_AT),
    NOW
  );
  ok(judged.matches && judged.reasons.length === 0, "a perfect candidate matches with no objections");
  const bad = judgeCandidate(
    { id: "x", parentId: "other", authorChannelId: "UCx", textOriginal: "no", publishedAt: null },
    stuck(),
    Date.parse(CLAIMED_AT),
    NOW
  );
  ok(!bad.matches && bad.reasons.length === 4, "every failing condition is reported, not just the first");
  ok(RESOLVE_TIME_SKEW_MS === 10 * 60 * 1000, "the timing window is ten minutes of skew");
  const decision = decideResolution([], stuck(), Date.parse(CLAIMED_AT), NOW);
  ok(decision.refusal === "no_match", "no candidates is no_match");
  ok(resolveRefusal(stuck()) === null, "a genuinely stuck row is resolvable");
  const parsed = readCandidate(apiReply());
  ok(parsed?.authorChannelId === EXPECTED_CHANNEL_ID, "readCandidate reads the nested author channel id");
  ok(readCandidate("nonsense") === null, "readCandidate rejects a non-object");
  ok(readCandidate({ id: 5 })?.id === null, "readCandidate refuses a non-string id");
}

console.log("=== 10. the resolver can never create a reply ===");
{
  const resolveSrc = stripComments(readFileSync("lib/youtube/recovery-resolve.ts", "utf8"));
  for (const forbidden of ["insertReply", "comments.insert", "commentThreads", "fetch("]) {
    ok(!resolveSrc.includes(forbidden), "the resolver module contains no " + forbidden);
  }
  // The word POSTING is a status here, so test the HTTP method rather than the
  // substring: a resolver that never issues a write method cannot create one.
  ok(!/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(resolveSrc), "the resolver issues no write HTTP method");
  const imports = (resolveSrc.match(/^import[\s\S]*?from "[^"]+";/gm) ?? []).map(
    (line) => (line.match(/from "([^"]+)"/) ?? [])[1]
  );
  ok(
    imports.every((m) => m === "./recovery-verify"),
    "the resolver imports only recovery-verify (" + imports.join(", ") + ")"
  );
  const routeSrc = stripComments(readFileSync("app/api/admin/youtube/recovery/[id]/resolve/route.ts", "utf8"));
  ok(!/insertReply|sendRecoveryAttempt/.test(routeSrc), "the resolve route cannot reach the send path");
}

console.log("=== 11. retry: only a definite failure qualifies ===");
{
  const h = retryHarness();
  const out = await executeRetryAuthorization(h.deps, "row-1");
  ok(out.ok === true, "a definitely-failed row can be authorized");
  ok(out.ok && out.status === "APPROVED", "it returns to APPROVED, it does not send");
  ok(h.authorized === 1, "the guarded transition applied once");
  ok(h.state.status === "APPROVED", "the row is APPROVED");
  ok(h.events.some((e) => e.reason === null), "an authorization event was recorded");
  ok(h.events[0].previousAttemptCount === 1, "the event preserves the previous attempt count");
  ok(
    h.events[0].previousError !== null && h.events[0].previousError.includes("commentNotFound"),
    "and the previous error, so failure provenance is not erased"
  );
  ok(out.ok && out.attemptCount === 1, "attempt_count is NOT reset by the retry");
}
for (const status of ["POSTING", "API_ACCEPTED", "VERIFIED_LIVE", "SKIP", "DRAFTED", "APPROVED", "HOLD", "REMOVED"]) {
  const h = retryHarness({ start: { status } });
  const out = await executeRetryAuthorization(h.deps, "row-1");
  ok(!out.ok && out.reason === "not_failed", status + " cannot be retried");
  ok(h.authorized === 0, status + " authorizes nothing");
}
{
  const h = retryHarness({ start: { posted_reply_id: "already-sent" } });
  const out = await executeRetryAuthorization(h.deps, "row-1");
  ok(!out.ok && out.reason === "already_posted", "a row with a posted reply id can never be retried");
}
{
  const note = buildFailureNote({ code: "network", message: "died" }, "outcome_unknown", "T");
  const h = retryHarness({ start: { last_error: note } });
  const out = await executeRetryAuthorization(h.deps, "row-1");
  ok(!out.ok && out.reason === "outcome_was_unknown", "a stored UNKNOWN note blocks the retry even if status says FAILED");
  ok(h.authorized === 0, "and nothing is authorized");
  ok(note.includes(UNKNOWN_OUTCOME_MARKER), "the marker the check relies on is the one buildFailureNote writes");
}
{
  const h = retryHarness({ evidence: "unresolved" });
  const out = await executeRetryAuthorization(h.deps, "row-1");
  ok(!out.ok && out.reason === "unresolved_ambiguity", "an unresolved unknown outcome in the event trail blocks the retry");
  ok(h.authorized === 0, "and nothing is authorized");
}
{
  const h = retryHarness({ start: { legacy_outcome: "POSTED_RECORDED" } });
  const out = await executeRetryAuthorization(h.deps, "row-1");
  ok(!out.ok && out.reason === "removal_unconfirmed", "an unconfirmed removal cannot be retried");
}

console.log("=== 12. retry: fresh verification runs again ===");
for (const [label, lookup, expected] of [
  ["STILL_LIVE", { status: 200, body: { items: [{ id: "x" }] } }, "fresh_still_live"],
  ["API_ERROR", { status: 500, body: null }, "fresh_api_error"],
  ["AMBIGUOUS (404)", { status: 404, body: null }, "fresh_ambiguous"],
  ["AMBIGUOUS (no items)", { status: 200, body: {} }, "fresh_ambiguous"],
  ["transport failure", { status: 0, body: null, networkError: "hang up" }, "fresh_api_error"],
] as const) {
  const h = retryHarness({ lookup });
  const out = await executeRetryAuthorization(h.deps, "row-1");
  ok(!out.ok && out.reason === expected, "a fresh " + label + " refuses the retry (" + expected + ")");
  ok(h.authorized === 0, "a fresh " + label + " authorizes nothing");
  ok(h.events.some((e) => e.reason === expected), "and the refusal is recorded as an event");
}
for (const [label, channel] of [
  ["a different channel", { id: "UCotherchannel000000", title: "Other" }],
  ["no channel", { id: null, title: null }],
] as const) {
  const h = retryHarness({ channel });
  const out = await executeRetryAuthorization(h.deps, "row-1");
  ok(!out.ok && out.reason === "channel_mismatch", label + " aborts the retry");
  ok(h.authorized === 0, label + " authorizes nothing");
}

console.log("=== 13. retry: the limit, and no automatic retry ===");
{
  const h = retryHarness({ start: { attempt_count: RECOVERY_MAX_TOTAL_ATTEMPTS } });
  const out = await executeRetryAuthorization(h.deps, "row-1");
  ok(!out.ok && out.reason === "retry_limit_reached", "a row at the cap cannot be authorized again");
  ok(h.authorized === 0, "nothing is authorized at the cap");
}
{
  // One authorization, then the row is APPROVED and no longer retryable.
  const h = retryHarness();
  await executeRetryAuthorization(h.deps, "row-1");
  const again = await executeRetryAuthorization(h.deps, "row-1");
  ok(!again.ok && again.reason === "not_failed", "a second retry immediately after the first is refused");
  ok(h.authorized === 1, "the transition applied exactly once");
}
{
  const h = retryHarness({ authorizeFails: true });
  const out = await executeRetryAuthorization(h.deps, "row-1");
  ok(!out.ok && out.reason === "transition_conflict", "a lost race on the transition is reported");
}
{
  const results = await Promise.all([
    (async () => {
      const h = retryHarness();
      const [a, b] = await Promise.all([
        executeRetryAuthorization(h.deps, "row-1"),
        executeRetryAuthorization(h.deps, "row-1"),
      ]);
      return { h, a, b };
    })(),
  ]);
  const { h, a, b } = results[0];
  ok([a, b].filter((r) => r.ok).length === 1, "two concurrent retries authorize exactly one");
  ok(h.authorized === 1, "and the transition applied exactly once");
}
ok(RECOVERY_MAX_TOTAL_ATTEMPTS === 2, "the hard cap is two total attempts");
{
  const retrySrc = stripComments(readFileSync("lib/youtube/recovery-retry.ts", "utf8"));
  ok(!/setInterval|setTimeout|while\s*\(/.test(retrySrc), "the retry module has no loop or timer");
  ok(!/insertReply|sendRecoveryAttempt|executeRecoverySend/.test(retrySrc), "the retry module cannot send");
  ok(
    /RETRY_TO_STATUS = "APPROVED"/.test(readFileSync("lib/youtube/recovery-retry.ts", "utf8")),
    "a retry lands in APPROVED -- the send path still runs its own checks afterwards"
  );
}

console.log("=== 14. routes: authorization, confirmation, and no client-supplied data ===");
for (const [name, path] of [
  ["send", "app/api/admin/youtube/recovery/[id]/send/route.ts"],
  ["resolve", "app/api/admin/youtube/recovery/[id]/resolve/route.ts"],
  ["retry", "app/api/admin/youtube/recovery/[id]/retry/route.ts"],
] as const) {
  const src = readFileSync(path, "utf8");
  const code = stripComments(src);
  ok(/const user = await getAuthenticatedUser\(\)/.test(code), name + ": unauthenticated is rejected");
  ok(/status: 401/.test(code), name + ": returns 401 without a session");
  ok(/isAuthorizedAdmin\(user\)/.test(code) && /status: 403/.test(code), name + ": non-admin gets 403");
  ok(/checkRateLimit\(/.test(code), name + ": is rate limited");
  ok(/confirmation_required/.test(code), name + ": requires an explicit confirmation verb");

  const authAt = code.indexOf("isAuthorizedAdmin(user)");
  const actAt = Math.max(
    code.indexOf("sendRecoveryAttempt("),
    code.indexOf("resolveStuckRecoverySend("),
    code.indexOf("authorizeRecoveryRetry(")
  );
  ok(authAt > 0 && actAt > authAt, name + ": authorization happens before the action");

  for (const forbidden of ["text", "draft_text", "textOriginal", "parentId", "legacyReplyId", "legacy_reply_id", "videoId", "category", "replyId", "attempt_count"]) {
    ok(!new RegExp("body\\.\\s*" + forbidden + "\\b").test(code), name + ": never reads body." + forbidden);
  }
  const bodyReads = code.match(/body\.\w+/g) ?? [];
  ok(
    bodyReads.every((read) => read === "body.confirm"),
    name + ": the ONLY field read from the request body is confirm (" + [...new Set(bodyReads)].join(", ") + ")"
  );
}

console.log("=== 15. refusal wording ===");
for (const reason of Object.keys(RECOVERY_RESOLVE_REFUSAL_TEXT)) {
  ok(typeof RECOVERY_RESOLVE_REFUSAL_TEXT[reason] === "string", "resolve: " + reason + " has wording");
}
for (const reason of Object.keys(RECOVERY_RETRY_REFUSAL_TEXT)) {
  ok(typeof RECOVERY_RETRY_REFUSAL_TEXT[reason] === "string", "retry: " + reason + " has wording");
}
ok(retryRefusal(retryRow()) === null && canRetryRecovery(retryRow()), "the rule helpers agree on a clean row");
ok(RETRY_FROM_STATUS === "FAILED" && RETRY_TO_STATUS === "APPROVED", "retry moves FAILED -> APPROVED");

console.log("=== 16. the deadline/notice pipeline is untouched ===");
{
  const vercel = readFileSync("vercel.json", "utf8");
  ok(/daily-maintenance/.test(vercel), "the daily-maintenance cron is still declared");
  ok(!/recovery/i.test(vercel), "no cron references the recovery feature at all");
  for (const path of [
    "lib/youtube/recovery-resolve.ts",
    "lib/youtube/recovery-retry.ts",
    "lib/youtube/recovery-events.ts",
  ]) {
    ok(!/deadline|notice|scholarship/i.test(readFileSync(path, "utf8")), path + " does not touch that pipeline");
  }
}

console.log("=== 17. the admin UI controls ===");
{
  const uiSrc = readFileSync("components/admin/youtube-recovery.tsx", "utf8");
  const code = stripComments(uiSrc);

  // The client sends a verb and nothing else. If this ever grows a text or id
  // field, the server would still ignore it -- but the request should not even
  // carry one.
  const bodies = code.match(/body: JSON\.stringify\(\{[^}]*\}\)/g) ?? [];
  ok(bodies.length > 0, "the UI posts JSON bodies");
  ok(
    bodies.every((b) => /\{\s*(confirm: action|action)\s*\}/.test(b)),
    "every request body is just a verb (" + bodies.join(" | ") + ")"
  );
  for (const forbidden of ["draft_text", "textOriginal", "parentId", "youtube_comment_id", "legacy_reply_id", "category"]) {
    ok(
      !bodies.some((b) => b.includes(forbidden)),
      "no request body carries " + forbidden
    );
  }

  // Confirmation is in-page now; section 22 covers the panel in detail.
  ok(!/window\.prompt\(/.test(code), "no browser prompt is used");
  ok(/setPending\(\{ id: item\.id, action: "send" \}\)/.test(code), "send opens an in-page confirmation");
  ok(/setPending\(\{ id: item\.id, action: "retry" \}\)/.test(code), "retry opens an in-page confirmation");

  // Visibility mirrors the server rules rather than inventing its own.
  ok(/canSendRecovery\(item\)/.test(code), "send visibility uses the shared canSendRecovery rule");
  ok(/canRetryRecovery\(item\)/.test(code), "retry visibility uses the shared canRetryRecovery rule");
  ok(
    /const resolveAllowed = item\.status === "POSTING"/.test(code),
    "resolve is offered only for a row stuck in POSTING"
  );

  // The send confirmation must show what will actually be sent (section 22).
  ok(/\{item\.draft_text\}/.test(code), "the send panel renders the exact draft text");
  ok(/\{item\.youtube_comment_id\}/.test(code), "and the target comment");
  ok(/CANNOT be undone/.test(code), "the send panel says it cannot be undone");
  ok(/READ-ONLY/.test(code), "the read-only panels say so");
  ok(/does NOT post anything/.test(code), "the resolve panel says it does not post");
  ok(/does NOT send/i.test(code), "the retry panel says it does not send");

  // No bulk, no unattended.
  ok(!/items\.map\([^)]*=>\s*runAction\(/.test(code), "there is no bulk send over the item list");
  ok(!/setInterval|setTimeout/.test(code), "the UI has no timer that could act on its own");
  const openers = code.match(/setPending\(\{ id: item\.id, action: "(send|resolve|retry|confirm)" \}\)/g) ?? [];
  ok(openers.length === 4, "each of the four actions opens its panel exactly once (" + openers.length + ")");
  ok(/onClick=\{\(\) => runAction\(item, openAction\)\}/.test(code), "the action runs only from the panel's own button");
  ok(!/runAction\(item, "send"\)/.test(code), "nothing calls runAction with a hardcoded send -- it must come through the panel");
}

console.log("=== 19. ambiguity evidence fails CLOSED ===");
{
  // The whole point: an unreadable trail is not permission.
  const h = retryHarness({ evidence: "unavailable" });
  const out = await executeRetryAuthorization(h.deps, "row-1");
  ok(
    !out.ok && out.reason === "ambiguity_evidence_unavailable",
    "an unavailable trail refuses the retry rather than allowing it"
  );
  ok(h.authorized === 0, "and nothing is authorized");
  ok(h.events.some((e) => e.reason === "ambiguity_evidence_unavailable"), "the refusal is recorded");
}
{
  const h = retryHarness({ evidence: "clear" });
  const out = await executeRetryAuthorization(h.deps, "row-1");
  ok(out.ok === true, "a clear trail still permits the retry");
}
{
  // The three answers must be genuinely distinct -- a boolean would collapse
  // 'unavailable' into 'clear', which is the bug this replaced.
  const seen = new Set<string>();
  for (const evidence of ["clear", "unresolved", "unavailable"] as const) {
    const h = retryHarness({ evidence });
    const out = await executeRetryAuthorization(h.deps, "row-1");
    seen.add(out.ok ? "authorized" : out.reason);
  }
  ok(seen.size === 3, "clear / unresolved / unavailable each produce a distinct outcome");
}
{
  const postCode = stripComments(readFileSync("lib/youtube/recovery-post.ts", "utf8"));
  ok(
    /if \(error \|\| !data\) return "unavailable"/.test(postCode),
    "a failed or missing events query returns unavailable, not clear"
  );
  ok(
    /if \(row\.attempt_count > 0 && types\.length === 0\) return "unavailable"/.test(postCode),
    "an attempted row with an empty history is treated as incomplete evidence"
  );
  ok(!/hasUnresolvedAmbiguity/.test(postCode), "the old boolean shape is gone");
}

console.log("=== 20. parent reply enumeration is paginated and fails closed when truncated ===");
{
  const h = resolveHarness({ listing: { ok: true, items: [apiReply()], truncated: true, pages: 20 } });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(
    !out.ok && out.reason === "listing_incomplete",
    "a truncated listing refuses EVEN THOUGH a candidate matched"
  );
  ok(h.marked.length === 0, "nothing is adopted from a partial list");
  ok(h.state.status === "POSTING", "the row stays stuck");
  ok(h.events[0].reason === "listing_incomplete", "and the reason is recorded");
}
{
  const h = resolveHarness({ listing: { ok: true, items: [apiReply()], truncated: false, pages: 3 } });
  const out = await executeStuckResolution(h.deps, "row-1");
  ok(out.ok === true, "a complete multi-page listing resolves normally");
}
{
  const apiCode = stripComments(readFileSync("lib/youtube/api.ts", "utf8"));
  ok(/nextPageToken/.test(apiCode), "the fetcher follows nextPageToken");
  ok(/pageToken=/.test(apiCode), "and sends it back as pageToken");
  ok(/do \{[\s\S]*\} while \(pageToken && pages < MAX_REPLY_PAGES\)/.test(apiCode), "it loops over pages with a hard cap");
  ok(/truncated: Boolean\(pageToken\)/.test(apiCode), "an outstanding token at the cap reports truncated");
  ok(/MAX_REPLY_PAGES = 20/.test(apiCode), "the cap is 20 pages");
  ok(/REPLY_PAGE_SIZE = 100/.test(apiCode), "at 100 replies per page");
}

console.log("=== 21. post-acceptance verification ===");
{
  const confirmRow = (over: Partial<ConfirmRow> = {}): ConfirmRow => ({
    id: "row-1",
    status: "API_ACCEPTED",
    youtube_comment_id: PARENT,
    posted_reply_id: "sent-reply-id",
    ...over,
  });

  const live = {
    status: 200,
    body: {
      items: [
        { id: "sent-reply-id", snippet: { parentId: PARENT, authorChannelId: { value: EXPECTED_CHANNEL_ID } } },
      ],
    },
  };

  ok(classifyConfirmation(confirmRow(), live).result === "VERIFIED_LIVE", "found + right parent + our channel -> VERIFIED_LIVE");
  ok(
    classifyConfirmation(confirmRow(), { status: 200, body: { items: [] } }).result === "REMOVED",
    "200 with an empty items array -> REMOVED"
  );
  for (const [label, lookup] of [
    ["404", { status: 404, body: null }],
    ["500", { status: 500, body: null }],
    ["network failure", { status: 0, body: null, networkError: "hang up" }],
    ["no items array", { status: 200, body: {} }],
    ["unparseable body", { status: 200, body: null }],
    ["two items for an exact id", { status: 200, body: { items: [{}, {}] } }],
  ] as const) {
    ok(classifyConfirmation(confirmRow(), lookup).result === "INCONCLUSIVE", label + " -> INCONCLUSIVE");
  }
  // A 404 must NOT be read as removal, exactly as everywhere else in the feature.
  ok(
    classifyConfirmation(confirmRow(), { status: 404, body: null }).result !== "REMOVED",
    "a 404 is never read as removal"
  );
  // Identity conditions.
  for (const [label, items] of [
    ["a different parent", [{ id: "sent-reply-id", snippet: { parentId: "other", authorChannelId: { value: EXPECTED_CHANNEL_ID } } }]],
    ["a different author", [{ id: "sent-reply-id", snippet: { parentId: PARENT, authorChannelId: { value: "UCsomeoneelse00000" } } }]],
    ["a different id", [{ id: "not-ours", snippet: { parentId: PARENT, authorChannelId: { value: EXPECTED_CHANNEL_ID } } }]],
  ] as const) {
    ok(
      classifyConfirmation(confirmRow(), { status: 200, body: { items } }).result === "INCONCLUSIVE",
      label + " is not proof the reply is live"
    );
  }

  ok(confirmRefusal(confirmRow()) === null, "an API_ACCEPTED row with an id is confirmable");
  ok(confirmRefusal(confirmRow({ status: "VERIFIED_LIVE" })) === null, "a live row can be re-checked");
  for (const status of ["APPROVED", "DRAFTED", "POSTING", "SKIP", "FAILED", "REMOVED"]) {
    ok(confirmRefusal(confirmRow({ status })) === "not_confirmable", status + " cannot be confirmed");
  }
  ok(confirmRefusal(confirmRow({ posted_reply_id: null })) === "no_reply_id", "no reply id, nothing to check");
  ok(canConfirmRecovery(confirmRow()), "canConfirmRecovery agrees");

  // The flow.
  interface CH { deps: ConfirmDeps; applied: Array<{ from: string; verdict: string }>; events: string[]; }
  const confirmHarness = (
    lookup: { status: number; body: unknown; networkError?: string },
    over: Partial<ConfirmRow> = {},
    channel?: { id: string | null; title: string | null }
  ): CH => {
    const h: CH = { applied: [], events: [], deps: null as unknown as ConfirmDeps };
    h.deps = {
      async loadRow() {
        return confirmRow(over);
      },
      async authenticatedChannel() {
        return channel ?? { id: EXPECTED_CHANNEL_ID, title: "Sushan" };
      },
      async lookupReply() {
        return lookup;
      },
      async applyVerdict(_id, from, verdict) {
        h.applied.push({ from, verdict });
        return true;
      },
      async recordEvent(input) {
        h.events.push(input.verdict.result);
      },
    };
    return h;
  };

  {
    const h = confirmHarness(live);
    const out = await executeConfirmation(h.deps, "row-1");
    ok(out.ok && out.status === "VERIFIED_LIVE", "a live reply verifies");
    ok(h.applied[0].verdict === "VERIFIED_LIVE" && h.applied[0].from === "API_ACCEPTED", "the write is guarded on the observed status");
    ok(h.events[0] === "VERIFIED_LIVE", "a verify-found event was recorded");
  }
  {
    const h = confirmHarness({ status: 200, body: { items: [] } });
    const out = await executeConfirmation(h.deps, "row-1");
    ok(out.ok && out.status === "REMOVED", "an empty result marks the row REMOVED");
    ok(h.events[0] === "REMOVED", "a verify-not-found event was recorded");
  }
  {
    const h = confirmHarness({ status: 500, body: null });
    const out = await executeConfirmation(h.deps, "row-1");
    ok(!out.ok && out.reason === "inconclusive", "an API error is inconclusive");
    ok(h.applied.length === 0, "and changes NO status -- not knowing is not a transition");
    ok(h.events[0] === "INCONCLUSIVE", "an inconclusive event is still recorded");
  }
  {
    const h = confirmHarness(live, {}, { id: "UCwrong0000000000000", title: "Wrong" });
    const out = await executeConfirmation(h.deps, "row-1");
    ok(!out.ok && out.reason === "channel_mismatch", "the wrong channel aborts the check");
    ok(h.applied.length === 0, "and changes nothing");
  }

  const confirmSrc = stripComments(readFileSync("lib/youtube/recovery-confirm.ts", "utf8"));
  ok(!/insertReply|comments\.insert|fetch\(/.test(confirmSrc), "the confirm module cannot post");
  ok(!/REMOVED[\s\S]{0,200}APPROVED/.test(confirmSrc), "nothing moves a REMOVED row back toward sending");
  const postCode2 = stripComments(readFileSync("lib/youtube/recovery-post.ts", "utf8"));
  ok(/removed_detected_at/.test(postCode2), "a REMOVED verdict stamps removed_detected_at");
  ok(/verified_at/.test(postCode2), "a VERIFIED_LIVE verdict stamps verified_at");
}

console.log("=== 22. in-page confirmation UI, no browser dialogs ===");
{
  const uiSrc = readFileSync("components/admin/youtube-recovery.tsx", "utf8");
  const code = stripComments(uiSrc);

  ok(!/window\.prompt\(/.test(code), "window.prompt is gone");
  ok(!/window\.confirm\([\s\S]{0,80}(SEND|RETRY)/.test(code), "no browser dialog guards send or retry");
  ok(/const \[pending, setPending\] = useState/.test(code), "confirmation is component state");
  ok(/const \[typed, setTyped\] = useState/.test(code), "the typed word is component state");
  ok(/<input/.test(code), "the typed confirmation is a real input");
  ok(/armed = spec \? spec\.word === null \|\| typed === spec\.word : false/.test(code), "the panel arms only on an exact match");
  ok(/disabled=\{busy \|\| !armed\}/.test(code), "the action button is disabled until armed");
  ok(/word: "SEND"/.test(code) && /word: "RETRY"/.test(code), "send and retry require typed words");
  ok(
    /confirm: \{[\s\S]{0,200}word: null/.test(code) && /resolve: \{[\s\S]{0,200}word: null/.test(code),
    "the two read-only checks do not demand a typed word"
  );
  ok(/\{item\.draft_text\}/.test(code), "the send panel renders the exact draft text in the page");
  ok(/\{item\.youtube_comment_id\}/.test(code), "and the target comment");
  ok(/\{item\.posted_reply_id\}/.test(code), "the confirm panel shows which reply id is being checked");
  ok(/CANNOT be undone/.test(code), "the send panel says it cannot be undone");
  ok(/READ-ONLY/.test(code), "the read-only panels say so");
  ok(/terminal/i.test(code), "the confirm panel explains REMOVED is terminal");
  ok(/Cancel/.test(code), "every panel can be cancelled");

  const bodies = code.match(/body: JSON\.stringify\(\{[^}]*\}\)/g) ?? [];
  ok(
    bodies.every((b) => /\{\s*(confirm: action|action)\s*\}/.test(b)),
    "every request body is still just a verb (" + bodies.join(" | ") + ")"
  );
  ok(/canConfirmRecovery\(item\)/.test(code), "confirm visibility uses the shared rule");
  ok(!/setInterval|setTimeout/.test(code), "the UI still has no timer");
}

console.log("=== 23. the confirm route ===");
{
  const src = readFileSync("app/api/admin/youtube/recovery/[id]/confirm/route.ts", "utf8");
  const code = stripComments(src);
  ok(/getAuthenticatedUser\(\)/.test(code) && /status: 401/.test(code), "unauthenticated is rejected");
  ok(/isAuthorizedAdmin\(user\)/.test(code) && /status: 403/.test(code), "non-admin is rejected");
  ok(/checkRateLimit\(/.test(code), "it is rate limited");
  ok(/body\.confirm !== "confirm"/.test(code), "an explicit verb is required");
  const bodyReads = code.match(/body\.\w+/g) ?? [];
  ok(bodyReads.every((r) => r === "body.confirm"), "confirm: only body.confirm is read (" + [...new Set(bodyReads)].join(", ") + ")");
  ok(!/insertReply|sendRecoveryAttempt/.test(code), "the confirm route cannot reach the send path");
  ok(/confirmRecoveryReply\(id, user\.id\)/.test(code), "it passes the row id and the server-derived actor");
}

console.log("=== 18. nothing in this suite touched YouTube ===");
ok(networkCalls === 0, "no real network call was attempted (" + networkCalls + ")");
}

main()
  .then(() => {
    console.log("");
    console.log(fail ? fail + " FAILURES" : "ALL YOUTUBE RECOVERY RESOLVE/RETRY CHECKS PASSED");
    process.exit(fail ? 1 : 0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
