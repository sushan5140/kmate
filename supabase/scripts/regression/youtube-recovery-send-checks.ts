/**
 * Recovery send-path checks.
 *
 * Run with:
 *   npx tsx --conditions react-server supabase/scripts/regression/youtube-recovery-send-checks.ts
 *
 * These drive the REAL orchestrator (executeRecoverySend) with fake I/O, so
 * the ordering, the race and every refusal branch are exercised as written --
 * not merely asserted about by reading the source. The fake insertReply
 * records calls and returns a made-up id; no network call happens anywhere in
 * this file, and a test fails loudly if the flow reaches the insert when it
 * should not have.
 *
 * The property under test: a recovery reply may be sent only when a FRESH
 * exact-id check, taken immediately before the claim, proves the legacy reply
 * is gone. Stored evidence is provenance. Every failure mode -- still live,
 * API error, malformed body, wrong channel, lost race -- must send nothing.
 */
import { readFileSync } from "node:fs";
import {
  CLAIM_FROM_STATUS,
  CLAIM_TO_STATUS,
  PayloadIntegrityError,
  RECOVERY_MAX_TOTAL_ATTEMPTS,
  RECOVERY_SEND_REFUSAL_TEXT,
  assertPayloadMatchesRow,
  buildFailureNote,
  buildSendPayload,
  canSendRecovery,
  classifySendFailure,
  executeRecoverySend,
  failureStatus,
  freshVerificationRefusal,
  recoverySendRefusal,
  type RecoverySendDeps,
  type RecoverySendRow,
} from "@/lib/youtube/recovery-send";
import { EXPECTED_CHANNEL_ID, VERIFICATION_RESULTS } from "@/lib/youtube/recovery-verify";

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

/**
 * A hard runtime guard: any real network call from this suite throws.
 * Stronger than scanning our own source for the word "googleapis".
 */
const realFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = ((...args: unknown[]) => {
  networkCalls++;
  throw new Error("REGRESSION BUG: the suite attempted a real network call: " + String(args[0]));
}) as typeof globalThis.fetch;

const APPROVED_TEXT = "The exact approved wording, and nothing else.";
const PARENT = "parent-comment-id";
const LEGACY = "legacy-reply-id";

const row = (over: Partial<RecoverySendRow> = {}): RecoverySendRow => ({
  id: "row-1",
  status: "APPROVED",
  legacy_outcome: "CONFIRMED_REMOVED",
  legacy_reply_id: LEGACY,
  youtube_comment_id: PARENT,
  draft_text: APPROVED_TEXT,
  posted_reply_id: null,
  attempt_count: 0,
  ...over,
});

/** A body that classifies as CONFIRMED_REMOVED: 200, items array, empty. */
const REMOVED_BODY = { status: 200, body: { items: [] } };
const LIVE_BODY = { status: 200, body: { items: [{ id: LEGACY }] } };

interface Harness {
  deps: RecoverySendDeps;
  inserts: Array<{ parentId: string; text: string }>;
  accepted: Array<{ id: string; replyId: string }>;
  failures: Array<{ id: string; status: string | null; note: string }>;
  events: Array<{ type: string; fromStatus?: string | null; toStatus?: string | null; youtubeReplyId?: string | null; attemptNumber?: number | null; metadata?: Record<string, unknown> }>;
  claims: number;
  state: RecoverySendRow;
}

/** A fake whose claim is genuinely atomic: the first caller wins, forever. */
function harness(
  options: {
    start?: Partial<RecoverySendRow>;
    lookup?: { status: number; body: unknown; networkError?: string };
    channel?: { id: string | null; title: string | null };
    insert?: () => Promise<{ replyId: string }>;
    missing?: boolean;
  } = {}
): Harness {
  const state = row(options.start);
  const h: Harness = {
    inserts: [],
    accepted: [],
    failures: [],
    events: [],
    claims: 0,
    state,
    deps: null as unknown as RecoverySendDeps,
  };

  h.deps = {
    async loadRow() {
      return options.missing ? null : { ...h.state };
    },
    async authenticatedChannel() {
      return options.channel ?? { id: EXPECTED_CHANNEL_ID, title: "Sushan" };
    },
    async lookupReply() {
      return options.lookup ?? REMOVED_BODY;
    },
    async claim(id, expect) {
      // Exactly the conditional UPDATE's semantics: match, or return nothing.
      if (
        h.state.status !== expect.status ||
        h.state.attempt_count !== expect.attemptCount ||
        h.state.posted_reply_id !== null
      ) {
        return null;
      }
      h.claims++;
      h.state = {
        ...h.state,
        status: CLAIM_TO_STATUS,
        attempt_count: expect.attemptCount + 1,
      };
      return { ...h.state };
    },
    async insertReply(payload) {
      h.inserts.push({ ...payload });
      if (options.insert) return options.insert();
      return { replyId: "new-reply-id" };
    },
    async recordAccepted(id, replyId) {
      h.accepted.push({ id, replyId });
      h.state = { ...h.state, status: "API_ACCEPTED", posted_reply_id: replyId };
    },
    async recordFailure(id, status, note) {
      h.failures.push({ id, status, note });
      if (status) h.state = { ...h.state, status };
    },
    async recordEvent(input) {
      h.events.push({ ...input });
    },
    now: () => "2026-09-04T00:00:00.000Z",
  };

  return h;
}

async function main() {
console.log("=== 1. the happy path: APPROVED + fresh CONFIRMED_REMOVED ===");
{
  const h = harness();
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(out.ok === true, "the send is allowed");
  ok(out.ok && out.status === "API_ACCEPTED", "the row lands in API_ACCEPTED, not a success-sounding status");
  ok(out.ok && out.postedReplyId === "new-reply-id", "the returned reply id is recorded");
  ok(h.inserts.length === 1, "exactly one insert happened");
  ok(h.claims === 1, "exactly one claim happened");
  ok(h.accepted.length === 1 && h.failures.length === 0, "success is recorded, no failure written");
}

console.log("=== 2. a fresh STILL_LIVE blocks the send ===");
{
  const h = harness({ lookup: LIVE_BODY });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "fresh_still_live", "refused with fresh_still_live");
  ok(h.inserts.length === 0, "NOTHING was sent");
  ok(h.claims === 0, "the row was never even claimed");
  ok(h.state.status === "APPROVED", "the row is left untouched in APPROVED");
}

console.log("=== 3. a fresh API_ERROR blocks the send ===");
for (const bad of [401, 403, 429, 500, 503]) {
  const h = harness({ lookup: { status: bad, body: { error: { errors: [{ reason: "quotaExceeded" }] } } } });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "fresh_api_error", "http " + bad + " refuses with fresh_api_error");
  ok(h.inserts.length === 0 && h.claims === 0, "http " + bad + " sends nothing and claims nothing");
}
{
  const h = harness({ lookup: { status: 0, body: null, networkError: "socket hang up" } });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "fresh_api_error", "a transport failure refuses with fresh_api_error");
  ok(h.inserts.length === 0, "a transport failure sends nothing");
}

console.log("=== 4. a fresh AMBIGUOUS blocks the send ===");
for (const [label, lookup] of [
  ["404", { status: 404, body: null }],
  ["200 with no items array", { status: 200, body: { items: "gone" } }],
  ["200 with no body", { status: 200, body: null }],
  ["200 with a non-object body", { status: 200, body: "removed" }],
] as const) {
  const h = harness({ lookup });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "fresh_ambiguous", label + " refuses with fresh_ambiguous");
  ok(h.inserts.length === 0 && h.claims === 0, label + " sends nothing and claims nothing");
}
{
  // The one that matters most: 404 is NOT removal here, even though the
  // outreach-side replyExists() treats it as gone.
  const h = harness({ lookup: { status: 404, body: null } });
  await executeRecoverySend(h.deps, "row-1");
  ok(h.inserts.length === 0, "a 404 is never read as permission to post");
}

console.log("=== 5. stale stored evidence cannot bypass the fresh check ===");
{
  // The row carries the real September evidence saying CONFIRMED_REMOVED, and
  // the live check says the reply is back. The live check must win.
  const h = harness({ lookup: LIVE_BODY });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "fresh_still_live", "stored CONFIRMED_REMOVED does not override a live STILL_LIVE");
  ok(h.inserts.length === 0, "nothing was sent on stale evidence");
}
{
  const sendSrc = readFileSync("lib/youtube/recovery-send.ts", "utf8");
  ok(
    !/legacy_evidence/.test(sendSrc),
    "the send path never reads legacy_evidence -- stored verification is provenance only"
  );
  ok(
    /await deps\.lookupReply\(row\.legacy_reply_id\)/.test(sendSrc),
    "the send path performs its own lookup against the stored legacy_reply_id"
  );
}

console.log("=== 6. the wrong authenticated channel aborts ===");
for (const [label, channel] of [
  ["a different channel", { id: "UCsomeoneElse000000000", title: "Someone Else" }],
  ["no channel at all", { id: null, title: null }],
] as const) {
  const h = harness({ channel });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "channel_mismatch", label + " aborts with channel_mismatch");
  ok(h.inserts.length === 0 && h.claims === 0, label + " sends nothing and claims nothing");
}
{
  const h = harness({ channel: { id: EXPECTED_CHANNEL_ID, title: "Renamed Channel" } });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(out.ok === true, "a renamed channel with the right id still proceeds -- the id is the identity");
}
{
  const verifySrc = readFileSync("lib/youtube/recovery-verify.ts", "utf8");
  ok(
    verifySrc.includes('EXPECTED_CHANNEL_ID = "UCkX7YBd1ChGcJWOFHTGSLXQ"'),
    "the expected channel is pinned in code, not read from an env var"
  );
  ok(verifySrc.includes('EXPECTED_CHANNEL_TITLE = "Sushan"'), "the expected channel title is Sushan");
}

console.log("=== 7. only APPROVED, unsent rows are sendable ===");
for (const status of ["DRAFTED", "SKIP", "HOLD", "POSTING", "API_ACCEPTED", "VERIFIED_LIVE", "REMOVED", "FAILED"]) {
  const h = harness({ start: { status } });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "not_approved", status + " cannot be sent");
  ok(h.inserts.length === 0 && h.claims === 0, status + " sends nothing");
}
{
  const h = harness({ start: { posted_reply_id: "already-there" } });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "already_posted", "a row with a posted_reply_id cannot be sent again");
  ok(h.inserts.length === 0, "an already-posted row sends nothing");
}
{
  // already_posted is checked before not_approved, so a row that is both
  // reports the more serious fact.
  const h = harness({ start: { status: "API_ACCEPTED", posted_reply_id: "x" } });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "already_posted", "already-sent is reported ahead of not-approved");
}
{
  const h = harness({ start: { legacy_outcome: "POSTED_RECORDED" } });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "removal_unconfirmed", "a POSTED_RECORDED row cannot be sent");
}
{
  const h = harness({ start: { attempt_count: RECOVERY_MAX_TOTAL_ATTEMPTS } });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "attempt_exhausted", "a row at the total attempt cap cannot be sent");
  ok(h.inserts.length === 0, "an exhausted row sends nothing");
}
{
  // attempt_count 1 with status APPROVED is only reachable through an
  // authorized retry, so it IS sendable -- the status is what prevents a
  // re-send, not the counter.
  const h = harness({ start: { attempt_count: 1 } });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(out.ok === true, "a retry-authorized row (attempt 1, APPROVED) can be sent once more");
  ok(h.inserts.length === 1, "and it sends exactly once");
}
{
  const h = harness({ missing: true });
  const out = await executeRecoverySend(h.deps, "nope");
  ok(!out.ok && out.reason === "not_found", "a missing row is not_found");
}
ok(RECOVERY_MAX_TOTAL_ATTEMPTS === 2, "at most two attempts ever: the first send plus one authorized retry");

console.log("=== 8. two concurrent sends: only one can win ===");
{
  const h = harness();
  const [a, b] = await Promise.all([
    executeRecoverySend(h.deps, "row-1"),
    executeRecoverySend(h.deps, "row-1"),
  ]);
  const winners = [a, b].filter((r) => r.ok);
  const losers = [a, b].filter((r) => !r.ok);
  ok(winners.length === 1, "exactly one send succeeded");
  ok(losers.length === 1, "exactly one was refused");
  ok(!losers[0].ok && losers[0].reason === "claim_conflict", "the loser was refused with claim_conflict");
  ok(h.inserts.length === 1, "the reply was inserted exactly ONCE");
  ok(h.claims === 1, "the row was claimed exactly once");
}
{
  // Five at once, same guarantee.
  const h = harness();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => executeRecoverySend(h.deps, "row-1"))
  );
  ok(results.filter((r) => r.ok).length === 1, "five concurrent sends produce exactly one success");
  ok(h.inserts.length === 1, "five concurrent sends produce exactly ONE insert");
  ok(
    results.filter((r) => !r.ok && r.reason === "claim_conflict").length === 4,
    "the other four are claim_conflict"
  );
}
{
  const postSrc = readFileSync("lib/youtube/recovery-post.ts", "utf8");
  ok(
    /\.eq\("status", expect\.status\)/.test(postSrc) &&
      /\.eq\("attempt_count", expect\.attemptCount\)/.test(postSrc) &&
      /\.is\("posted_reply_id", null\)/.test(postSrc),
    "the real claim is a conditional update on status + attempt_count + unsent"
  );
}

console.log("=== 9. the payload is the stored row, and only the stored row ===");
{
  const h = harness();
  await executeRecoverySend(h.deps, "row-1");
  ok(h.inserts[0].text === APPROVED_TEXT, "the exact stored draft_text was sent");
  ok(h.inserts[0].parentId === PARENT, "the parent is the stored youtube_comment_id");
}
{
  const r = row();
  const payload = buildSendPayload(r);
  ok(payload.text === r.draft_text && payload.parentId === r.youtube_comment_id, "buildSendPayload copies the row");
  ok(buildSendPayload.length === 1, "buildSendPayload takes ONLY a row -- there is no parameter for caller text");
}
{
  let threw = false;
  try {
    assertPayloadMatchesRow({ parentId: PARENT, text: "injected text" }, row());
  } catch (error) {
    threw = error instanceof PayloadIntegrityError;
  }
  ok(threw, "a payload whose text differs from the row is refused before sending");
}
{
  let threw = false;
  try {
    assertPayloadMatchesRow({ parentId: "other-parent", text: APPROVED_TEXT }, row());
  } catch (error) {
    threw = error instanceof PayloadIntegrityError;
  }
  ok(threw, "a payload aimed at a different parent is refused before sending");
}
{
  // Drift between the eligibility read and the claim must not be sent on.
  const h = harness();
  const original = h.deps.claim.bind(h.deps);
  h.deps.claim = async (id, expect) => {
    const claimed = await original(id, expect);
    return claimed ? { ...claimed, legacy_reply_id: "a-different-legacy-id" } : null;
  };
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "claim_state_drift", "a row that changed during the claim is refused");
  ok(h.inserts.length === 0, "drift sends nothing");
}

console.log("=== 10. the route trusts nothing from the client ===");
{
  const routeSrc = readFileSync("app/api/admin/youtube/recovery/[id]/send/route.ts", "utf8");
  const body = routeSrc.slice(routeSrc.indexOf("export async function POST"));
  for (const forbidden of ["textOriginal", "parentId", "draft_text", "legacyReplyId", "legacy_reply_id", "videoId", "category"]) {
    ok(!new RegExp("body\\.\\s*" + forbidden).test(body), "the route never reads body." + forbidden);
  }
  ok(/body\.confirm !== "send"/.test(body), "the route requires an explicit confirm verb");
  ok(
    /sendRecoveryAttempt\(id, user\.id\)/.test(body),
    "the route passes only the row id and the SERVER-derived actor to the send path"
  );
  ok(
    /const user = await getAuthenticatedUser\(\)/.test(routeSrc),
    "and that actor comes from the verified session, never from the request body"
  );
  ok(
    !/insertReply|comments\.insert|googleapis/.test(routeSrc),
    "the route does not reach YouTube itself"
  );
}
{
  const sendSrc = readFileSync("lib/youtube/recovery-send.ts", "utf8");
  ok(
    !/fetch\(|googleapis|supabase/i.test(stripComments(sendSrc)),
    "the rules module has no network and no database of its own"
  );
}

console.log("=== 11. authorization is the existing admin gate ===");
{
  const routeSrc = readFileSync("app/api/admin/youtube/recovery/[id]/send/route.ts", "utf8");
  const decideSrc = readFileSync("app/api/admin/youtube/recovery/[id]/decide/route.ts", "utf8");
  for (const guard of ["getAuthenticatedUser", "isAuthorizedAdmin", "checkRateLimit"]) {
    ok(routeSrc.includes(guard), "the send route uses " + guard);
    ok(decideSrc.includes(guard), "which is the same guard the decide route uses (" + guard + ")");
  }
  const authIndex = routeSrc.indexOf("isAuthorizedAdmin(user)");
  const sendIndex = routeSrc.indexOf("sendRecoveryAttempt(id, user.id)");
  ok(authIndex > 0 && authIndex < sendIndex, "authorization is checked BEFORE anything is sent");
  ok(/status: 401/.test(routeSrc) && /status: 403/.test(routeSrc), "unauthenticated 401, non-admin 403");
  const postSrc = readFileSync("lib/youtube/recovery-post.ts", "utf8");
  ok(postSrc.startsWith('import "server-only";'), "the posting module is server-only");
  ok(/getSupabaseAdmin/.test(postSrc), "it uses the service-role client; recovery tables stay service-role only");
}

console.log("=== 12. failure behaviour ===");
{
  // A definite rejection: YouTube answered no. Nothing was created.
  const h = harness({
    insert: async () => {
      throw { code: "commentNotFound", message: "The parent comment could not be found.", httpStatus: 404 };
    },
  });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "send_failed", "a definite rejection reports send_failed");
  ok(!out.ok && out.reason === "send_failed" && out.disposition === "definite_rejection", "classified as definite_rejection");
  ok(h.failures[0].status === "FAILED", "the row is recorded FAILED");
  ok(h.state.status === "FAILED", "and lands in FAILED");
  ok(h.accepted.length === 0, "no success was recorded");
}
{
  // The dangerous one: we do not know whether the reply exists.
  const h = harness({
    insert: async () => {
      throw {
        code: "network",
        message: "The request to YouTube failed before a response was received.",
        outcomeUnknown: true,
      };
    },
  });
  const out = await executeRecoverySend(h.deps, "row-1");
  ok(!out.ok && out.reason === "send_failed" && out.disposition === "outcome_unknown", "classified as outcome_unknown");
  ok(h.failures[0].status === null, "the row is NOT marked FAILED -- that would claim it did not post");
  ok(h.state.status === CLAIM_TO_STATUS, "it stays POSTING, requiring a human");
  ok(h.accepted.length === 0, "it is NOT recorded as accepted either");
  ok(/OUTCOME UNKNOWN/.test(h.failures[0].note), "the stored note says the outcome is unknown");
  ok(/Do not re-send/.test(h.failures[0].note), "the note warns against re-sending");
  ok(!out.ok && out.reason === "send_failed" && out.httpStatus === 500, "the response status marks it as needing attention");
}
{
  // An accepted insert with no usable id is also unknown, not success.
  const h = harness({
    insert: async () => {
      throw { code: "no_reply_id", message: "YouTube accepted the reply but returned no id.", outcomeUnknown: true };
    },
  });
  await executeRecoverySend(h.deps, "row-1");
  ok(h.state.status === CLAIM_TO_STATUS, "an id-less acceptance leaves the row POSTING for review");
}
{
  // After an unknown outcome, the row must not be re-sendable by this code.
  const h = harness({
    insert: async () => {
      throw { code: "network", message: "died in flight", outcomeUnknown: true };
    },
  });
  await executeRecoverySend(h.deps, "row-1");
  const again = await executeRecoverySend(h.deps, "row-1");
  ok(!again.ok && again.reason === "not_approved", "a second send after an unknown outcome is refused");
  ok(h.inserts.length === 1, "no automatic retry -- the insert ran exactly once");
}
ok(classifySendFailure({ code: "x", message: "y", outcomeUnknown: true }) === "outcome_unknown", "outcomeUnknown maps to outcome_unknown");
ok(classifySendFailure({ code: "x", message: "y" }) === "definite_rejection", "a plain error maps to definite_rejection");
ok(failureStatus("outcome_unknown") === null, "outcome_unknown never writes a status");
ok(failureStatus("definite_rejection") === "FAILED", "definite_rejection writes FAILED");

console.log("=== 13. no retry loop, no cron, no drainer ===");
{
  const sendSrc = readFileSync("lib/youtube/recovery-send.ts", "utf8");
  const postSrc = readFileSync("lib/youtube/recovery-post.ts", "utf8");
  const routeSrc = readFileSync("app/api/admin/youtube/recovery/[id]/send/route.ts", "utf8");
  for (const [name, raw] of [["rules", sendSrc], ["server", postSrc], ["route", routeSrc]] as const) {
    const src = stripComments(raw);
    ok(!/setInterval|setTimeout|cron|while\s*\(/.test(src), "the " + name + " module has no loop or timer");
    ok(!/for\s*\(.*of\s+rows/.test(src), "the " + name + " module does not iterate a set of rows");
  }
  // The server module now contains the human-authorized retry wiring, so the
  // question is not "is retry mentioned" but "can anything retry ITSELF".
  const postCode = stripComments(postSrc);
  // Invocations only: a `function foo(` declaration is not a call to foo.
  const callsTo = (name: string) =>
    (postCode.match(new RegExp("(?<!function\\s)\\b" + name + "\\(", "g")) ?? []).length;
  ok(
    callsTo("executeRecoverySend") === 1,
    "the send flow is invoked from exactly one place -- nothing re-invokes it"
  );
  ok(
    callsTo("executeRetryAuthorization") === 1 && callsTo("authorizeRecoveryRetry") === 0,
    "a retry must be requested from outside; the server module never authorizes one for itself"
  );
  ok(
    callsTo("executeStuckResolution") === 1 && callsTo("resolveStuckRecoverySend") === 0,
    "likewise a resolution is only ever requested from outside"
  );
}
{
  const vercel = readFileSync("vercel.json", "utf8");
  ok(!/recovery.*send|send.*recovery/i.test(vercel), "vercel.json has no cron pointed at the send route");
}

console.log("=== 14. the deadline/notice pipeline is untouched ===");
{
  const vercel = readFileSync("vercel.json", "utf8");
  ok(/daily-maintenance/.test(vercel), "the daily-maintenance cron is still declared");
  const sendSrc = readFileSync("lib/youtube/recovery-send.ts", "utf8");
  const postSrc = readFileSync("lib/youtube/recovery-post.ts", "utf8");
  for (const [name, src] of [["rules", sendSrc], ["server", postSrc]] as const) {
    ok(
      !/deadline|notice|scholarship/i.test(src),
      "the " + name + " module does not reference the deadline/notice pipeline"
    );
  }
}

console.log("=== 15. the rules themselves ===");
{
  ok(recoverySendRefusal(row()) === null, "a clean approved row is sendable");
  ok(canSendRecovery(row()), "canSendRecovery agrees");
  ok(CLAIM_FROM_STATUS === "APPROVED" && CLAIM_TO_STATUS === "POSTING", "the claim moves APPROVED -> POSTING");
  for (const result of VERIFICATION_RESULTS) {
    const refusal = freshVerificationRefusal(result);
    ok(
      (refusal === null) === (result === "CONFIRMED_REMOVED"),
      "fresh " + result + " -> " + (refusal ?? "allowed")
    );
  }
  const note = buildFailureNote({ code: "quotaExceeded", message: "Quota exceeded", httpStatus: 403 }, "definite_rejection", "T");
  ok(/quotaExceeded/.test(note) && /403/.test(note), "the failure note keeps the API reason and status");
  ok(!/OUTCOME UNKNOWN/.test(note), "a definite rejection is not labelled unknown");
  for (const reason of [
    "not_approved", "already_posted", "attempt_exhausted", "removal_unconfirmed",
    "fresh_still_live", "fresh_api_error", "fresh_ambiguous", "channel_mismatch",
    "claim_conflict", "claim_state_drift", "send_failed", "not_found",
  ]) {
    ok(typeof RECOVERY_SEND_REFUSAL_TEXT[reason] === "string", reason + " has reviewer-facing wording");
  }
}

console.log("=== 16. nothing in this suite touched YouTube ===");
{
  // Proven at runtime, not by grepping our own source: globalThis.fetch was
  // replaced with a trap before the first test ran, and every send above went
  // through fake deps. A single real request would have thrown.
  ok(networkCalls === 0, "no real network call was attempted (" + networkCalls + ")");
  ok(typeof realFetch === "function", "the real fetch was captured and never invoked by this suite");

  // The import graph is the other half: the rules module cannot reach YouTube
  // even if someone wired it wrongly, because it imports no client at all.
  const sendSrc = stripComments(readFileSync("lib/youtube/recovery-send.ts", "utf8"));
  const imports = sendSrc.match(/^import[\s\S]*?from "[^"]+";/gm) ?? [];
  const modules = imports.map((line) => (line.match(/from "([^"]+)"/) ?? [])[1]);
  ok(
    modules.every((m) => m === "./recovery-verify" || m === "./recovery-events"),
    "the rules module imports only pure sibling modules (" + modules.join(", ") + ")"
  );
  ok(
    !modules.some((m) => /api|supabase|oauth|post/.test(m ?? "")),
    "it imports no YouTube client, no Supabase client and no server module"
  );
}

}

main().then(() => {
  console.log("");
  console.log(fail ? fail + " FAILURES" : "ALL YOUTUBE RECOVERY SEND CHECKS PASSED");
  process.exit(fail ? 1 : 0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
