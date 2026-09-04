# Security regression suite

Standalone `tsx` scripts (no test runner configured in this project) proving
each fix from the Phase 2/3 security passes. Each is independently runnable
and self-cleans any throwaway `e2e-*@example.com` accounts it creates.

All scripts read Supabase credentials from `.env.local`.

| Script | Fix | Needs a running server? |
|---|---|---|
| `fix1-admin-escalation.ts` | Critical: self-escalation to `is_admin` | No (hits Supabase directly) |
| `fix2-header-spoofing.ts` | High: spoofable `x-kmate-user-id` header | Yes |
| `fix3-connection-requests.ts` | High: self-accepting your own connection request | No (hits Supabase directly) |
| `fix4-security-headers.ts` | Medium: security headers + CSP | Yes, production build |
| `fix5-6-rate-limits-unit.ts` | Medium/Low: rate limiting (429 + window recovery) | No (imports `lib/rate-limit.ts` directly) |
| `fix6-rate-limits-http.ts` | Medium: rate limiting on admin moderate + account/delete, over real HTTP | Yes, production build |
| `fix-admin-bootstrap.ts` | Admin-bootstrap mechanism (`admin_bootstrap_promote()`) -- wrong secret rejected + logged, right secret promotes + logs, normal trigger unaffected | No (hits Supabase directly) |
| `fix7-batch5-audit.ts` | Batch-5 audit (ECA badge / ECA+Mistakes downvote / Discover filter / computed application years / Timeline banner): RLS on `eca_upvotes`/`mistake_upvotes` rejects cross-user writes, `castVote()`'s table config ignores request bodies, `application_year` is validated server-side against `validApplicationYears(track)` on both profile-update and onboarding-complete (bypass values rejected, real values still accepted), `vote-eca`/`vote-mistake` rate limits enforced, Ask-the-Interviewer regression, `eca_upvotes`/`mistake_upvotes` count-integrity check | Yes, production build |
| `fix7b-onboarding-timeline-e2e.ts` | Batch-5 audit, browser-driven: onboarding year-step gating (`applicationYear` starts unselected, blocks Next) and shown years for both tracks, full onboarding completion with a valid year, stale `application_year` account's "cycle closed" messaging on Home/Timeline | Yes, production build |
| `fix7c-discover-initial-state.ts` | Batch-5 audit: Discover tab renders sensibly (defaults to viewer's own track) before any track filter pill has ever been clicked | Yes, production build |
| `gks-assistant-e2e.ts` | GKS Assistant structured answers: asking persists a thread and materialises imported answers (always `origin='community_import'` with a null `author_id`), imported contributors get a stable generated alias and never leak their raw `sender_alias` or a fabricated timestamp, re-asking joins the same deduped thread, upvotes are one-per-user and toggle, a KMate answer stores `origin='kmate_user'` with a real `author_id`, save-question is private and toggles, discussion threads stay one level deep and can't be grafted across questions, anonymous callers are turned away and write nothing | Yes, production build **and** a reachable `GKS_RAG_URL` |
| `readiness-checks.ts` | Application Readiness: the checks delivered with the readiness dataset, plus integration coverage -- the GKS-U/GKS-G national checklists render without a university, university extras come only from the Requirement Checker records and are scoped through its track hierarchy, KMOU + Maritime Sciences surfaces the Seafarer's Medical Certificate, no university adds a national document, and the client-side summary agrees with the engine (never reporting 100% while a required document is untracked) | No (imports the datasets directly; needs `--conditions react-server`) |
| `youtube-recovery-checks.ts` | YouTube recovery drafts: exact 20-row/four-batch shape, evidence-honest legacy matching, approval blocked until removal is confirmed, active-parent uniqueness migration guardrails, and no posting path | No (pure logic; needs `--conditions react-server`) |
| `youtube-recovery-verify-checks.ts` | Exact-reply-id verifier: only a 200 with an empty `items` array proves removal (404, API errors, malformed bodies and transport failures never do), wrong-channel abort, dry-run writes nothing, and `--apply-evidence` may touch only `legacy_outcome`/`legacy_evidence`/`updated_at` | No (pure logic; needs `--conditions react-server`) |
| `youtube-recovery-send-checks.ts` | Recovery send path: a fresh exact-id check runs immediately before every send (stored evidence is provenance only), STILL_LIVE / API_ERROR / AMBIGUOUS / wrong-channel all send nothing, concurrent claims produce exactly one insert, the payload is the stored row's own text, and an unknown API outcome never retries | No (drives the real orchestrator with fakes; needs `--conditions react-server`) |
| `youtube-recovery-resolve-checks.ts` | Stuck-send resolver, human-authorized retry and the append-only recovery event trail: a resolution needs exactly one reply matching parent + channel + exact text + timing, retry accepts only a definite failure (never an unknown outcome), and event metadata refuses secret-shaped values | No (drives the real orchestrators with fakes; needs `--conditions react-server`) |

## YouTube recovery verifier

`supabase/scripts/verify-youtube-recovery.ts` re-checks every stored
`legacy_reply_id` against YouTube and records what it observed. It is read-only
against YouTube: the only calls it can make are an OAuth refresh, one
`channels.list` identity check, and one `comments.list` per row, enforced by an
allow-list on every request. It aborts unless the authenticated channel is
`UCkX7YBd1ChGcJWOFHTGSLXQ`.

Dry run is the default and writes nothing:

```bash
npx tsx --conditions react-server supabase/scripts/verify-youtube-recovery.ts
```

The result is not merely informational. `recoveryApproveRefusal` reads the
latest recorded check back out of `legacy_evidence`, and a row whose latest
check is anything other than `CONFIRMED_REMOVED` cannot be approved even while
its historical `legacy_outcome` still says it was removed. Outcomes are never
downgraded automatically; approval simply stops trusting a stale verdict.

Recording the evidence is opt-in, and may only write `legacy_outcome`,
`legacy_evidence` and `updated_at` -- never a status, a posted reply id, or any
posting field:

```bash
npx tsx --conditions react-server supabase/scripts/verify-youtube-recovery.ts --apply-evidence
```

Credentials come from `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` /
`YOUTUBE_REFRESH_TOKEN` when all three are set, otherwise from the local bot's
`token.json` / `credentials.json` (override with `--token` / `--credentials`).

## Running

```bash
# No server needed:
npx tsx supabase/scripts/regression/fix1-admin-escalation.ts
npx tsx supabase/scripts/regression/fix3-connection-requests.ts
npx tsx supabase/scripts/regression/fix5-6-rate-limits-unit.ts
npx tsx --conditions react-server supabase/scripts/regression/readiness-checks.ts
npx tsx --conditions react-server supabase/scripts/regression/youtube-recovery-checks.ts
npx tsx --conditions react-server supabase/scripts/regression/youtube-recovery-verify-checks.ts
npx tsx --conditions react-server supabase/scripts/regression/youtube-recovery-send-checks.ts
npx tsx --conditions react-server supabase/scripts/regression/youtube-recovery-resolve-checks.ts

# Requires KMATE_TEST_SECRET set to a THROWAWAY test value (never your real
# ADMIN_BOOTSTRAP_SECRET) whose hash is populated into
# admin_bootstrap_config.secret_hash before running -- see SECURITY.md
# "Admin bootstrap" for the exact upsert. Don't leave a test secret
# configured on the database when you're done; clear the row or overwrite it
# with your real one.
KMATE_TEST_SECRET=<throwaway-test-secret> npx tsx supabase/scripts/regression/fix-admin-bootstrap.ts

# Needs a server -- use a production build, not `next dev`
# (an unrelated Turbopack dev-mode quirk broke cookie-based auth in these
# scripts during Phase 3 testing; `next start` doesn't have it):
npm run build && npm run start -- -p 3901
KMATE_BASE_URL=http://localhost:3901 npx tsx supabase/scripts/regression/fix2-header-spoofing.ts
KMATE_BASE_URL=http://localhost:3901 npx tsx supabase/scripts/regression/fix4-security-headers.ts
KMATE_BASE_URL=http://localhost:3901 KMATE_ADMIN_EMAIL=you@example.com \
  npx tsx supabase/scripts/regression/fix6-rate-limits-http.ts
KMATE_BASE_URL=http://localhost:3901 npx tsx supabase/scripts/regression/fix7-batch5-audit.ts
KMATE_BASE_URL=http://localhost:3901 npx tsx supabase/scripts/regression/fix7b-onboarding-timeline-e2e.ts
KMATE_BASE_URL=http://localhost:3901 npx tsx supabase/scripts/regression/fix7c-discover-initial-state.ts

# Also needs the GKS RAG service reachable at GKS_RAG_URL (see gks-rag/README.md);
# locally: cd gks-rag && .venv/Scripts/python -m uvicorn app.main:app --port 8000
KMATE_BASE_URL=http://localhost:3901 npx tsx supabase/scripts/regression/gks-assistant-e2e.ts
```

`fix7b-onboarding-timeline-e2e.ts` drives a real Chromium browser via
`playwright` (a real devDependency, not a throwaway install -- browsers are
fetched separately: `npx playwright install chromium` if `~/.cache/ms-playwright`
or `%LOCALAPPDATA%\ms-playwright` doesn't already have one).

`fix6-rate-limits-http.ts`'s admin-moderate check needs `KMATE_ADMIN_EMAIL`
pointing at an account that is *already* `is_admin = true` -- promote one
with `supabase/scripts/bootstrap-admin.ts` (see SECURITY.md "Admin
bootstrap") if none exists yet. It deliberately doesn't promote one itself;
this test is about rate limiting, not admin bootstrapping, and shouldn't
carry that side effect. Without `KMATE_ADMIN_EMAIL` set, that one check is
skipped; the `account/delete` check in the same file still runs.
