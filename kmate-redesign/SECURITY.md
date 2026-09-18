# Security posture

This document summarizes a security audit and remediation pass done across
four phases: an audit (Phase 1), critical/high fixes (Phase 2), medium/low
fixes plus a final verification sweep (Phase 3), and an admin-bootstrap
mechanism closing an operational gap Phase 3 surfaced (Phase 4). It's meant
to let a future contributor understand the current security posture without
re-deriving it.

## What was audited (Phase 1)

Secrets/env var handling, Supabase RLS policies, auth flow, API route
authorization, XSS/injection surfaces, security headers, dependency
vulnerabilities (`npm audit`), and CORS.

## What was found and fixed

### Critical

**Profile `is_admin` self-escalation.** The `profiles_update_own` RLS policy
(`auth.uid() = id`, no `WITH CHECK`) let any signed-in user `PATCH` their own
`is_admin` to `true` via the Supabase REST API directly, bypassing the app's
UI entirely.

Fixed with a `BEFORE UPDATE` trigger, `guard_profiles_is_admin()`
(`supabase/schema.sql`), that silently reverts `is_admin` to its prior value
unless the acting session's `auth.uid()` already belongs to an admin. The RLS
policy itself is untouched; the trigger is a second, independent layer.

Regression test: `supabase/scripts/regression/fix1-admin-escalation.ts`.

**Operational consequence discovered in Phase 3**: this trigger reverts
`is_admin` writes from *any* session without an admin `auth.uid()` --
including the service-role key and a raw SQL Editor connection, not just a
malicious user session. There were zero admins in the database when this was
discovered, and no session anywhere could satisfy the trigger's check -- a
bootstrap deadlock. The first admin was promoted via a one-time, explicitly
authorized bypass (`SET LOCAL session_replication_role = replica` inside a
single transaction).

**Closed with a proper admin-bootstrap mechanism (Phase 4)** -- see "Admin
bootstrap" below for the full, repeatable procedure. Promoting any future
admin no longer requires touching triggers or RLS by hand.

### Admin bootstrap

A dedicated `SECURITY DEFINER` function, `admin_bootstrap_promote(target_email
text, secret text)` (`supabase/schema.sql`), is the **only** code path
allowed to bypass `guard_profiles_is_admin()`'s normal restriction. It:

1. Compares a SHA-256 hash of the provided secret against
   `admin_bootstrap_config.secret_hash` (a single-row table, RLS-enabled with
   zero policies -- deny-all via the REST API; only the function itself and
   the service-role key can touch it). The plaintext secret is never stored
   anywhere, only its hash.
2. On a match, sets a transaction-local flag (`kmate.bootstrap_promote`) that
   `guard_profiles_is_admin()` checks for -- the only place in the codebase
   that ever sets it, and not reachable via PostgREST (`set_config` is a
   `pg_catalog` builtin, not a public-schema function PostgREST exposes).
3. Promotes the target user and logs the attempt -- success or failure -- to
   `admin_actions_log`.
4. Is locked to `service_role` only (`revoke ... from public, anon,
   authenticated`), so it isn't reachable as a REST RPC endpoint by the
   deployed app at all, on top of the secret check.

**To promote an admin:**

1. One-time setup (if `admin_bootstrap_config` is empty -- check by trying a
   promotion; it'll fail with "no secret configured" if so): pick a long
   random secret (e.g. `openssl rand -hex 32`), then in the SQL Editor:
   ```sql
   select encode(digest('your-chosen-secret', 'sha256'), 'hex');
   -- copy the resulting hash, then:
   insert into public.admin_bootstrap_config (id, secret_hash)
   values (true, 'paste-the-hash-here')
   on conflict (id) do update set secret_hash = excluded.secret_hash, updated_at = now();
   ```
   Keep the plaintext secret in a password manager -- it's never recoverable
   from the hash. (An earlier draft of this mechanism tried to store the hash
   via `alter database ... set ...`; that failed with "permission denied" --
   Supabase's hosted Postgres doesn't grant the connecting role persistent
   `ALTER DATABASE`/`ALTER ROLE SET` rights. The table-based design above is
   the actual, working mechanism.)
2. Promote:
   ```bash
   ADMIN_BOOTSTRAP_SECRET=<your-secret> npx tsx supabase/scripts/bootstrap-admin.ts <email> --secret <your-secret>
   ```
   `bootstrap-admin.ts` is deliberately not wired into any route -- it's a
   local-only script, run by hand.
3. Check the trail any time via `admin_actions_log` (service-role only).

Regression test: `supabase/scripts/regression/fix-admin-bootstrap.ts` --
wrong secret is rejected and logged as a failure with no promotion; right
secret promotes and logs a success; a normal non-admin `PATCH` self-promotion
attempt is still blocked exactly as before, proving the bootstrap mechanism
doesn't weaken the trigger's normal behavior anywhere else.

### High

**Spoofable `x-kmate-user-id` header.** `proxy.ts` forwards the
already-verified user id to Server Components via a request header (to avoid
a redundant `supabase.auth.getUser()` call in every page). It only ever *set*
this header inside `if (user)`, never cleared it otherwise -- a request with
no session at all, but a client-supplied `x-kmate-user-id` header, would have
that spoofed value pass straight through untouched, and `AppShell` trusted it
as "the verified signed-in user" on every public path.

Fixed with an unconditional `request.headers.delete("x-kmate-user-id")` as
the first line of `proxy()`, before anything else runs.

Regression test: `supabase/scripts/regression/fix2-header-spoofing.ts`.

**`connection_requests` self-accept.** The old
`connection_requests_update_parties` RLS policy let either party in a
connection request update it to *any* status -- including the sender
accepting their own pending request, which would make `contact_methods`
mutually visible without the recipient ever consenting.

Fixed by splitting it into two policies in `supabase/schema.sql`:
`connection_requests_accept_or_decline` (recipient only, target status
restricted to `accepted`/`declined`) and `connection_requests_revoke` (either
party, target status restricted to `revoked`) -- matching exactly what
`app/api/connections/respond/route.ts` and `.../revoke/route.ts` already
enforce in application code.

Regression test: `supabase/scripts/regression/fix3-connection-requests.ts`.

### Medium

**Missing security headers / no CSP.** `next.config.ts` had no `headers()`
block and `proxy.ts` set no response headers at all.

Fixed with:
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` (disables `camera`, `microphone`, `geolocation`,
  `payment`, `usb` -- confirmed unused anywhere in the app), and
  `Strict-Transport-Security` (production only, gated on `NODE_ENV`) --
  all in `next.config.ts`.
- A nonce-based Content-Security-Policy in `proxy.ts`, following
  [Next's own documented pattern](https://nextjs.org/docs/app/guides/content-security-policy).
  `script-src 'self' 'nonce-<per-request>' 'strict-dynamic'` -- no
  `unsafe-inline` for scripts. This costs nothing here: every route in this
  app already reads `headers()`/`cookies()` in `AppShell`, so the whole app
  is dynamically rendered regardless (confirmed via `next build`), which is
  the usual tradeoff nonce-based CSP requires.
- `style-src 'self' 'unsafe-inline'` (not nonce'd). A real browser check
  (forged session covering public, authenticated, and admin pages) found
  Framer Motion writes `element.style.cssText` directly for its animations,
  which CSP always classifies as an inline-style mutation -- there's no way
  to attach a nonce to a CSSOM `cssText` write. A nonce'd `style-src` broke
  the onboarding wizard's step transitions and the admin pages' action
  menus. `script-src` staying strict is what actually matters for XSS
  defense; `style-src` relaxation was a deliberate, confirmed-necessary
  trade discussed and approved before shipping.
- `connect-src 'self' <supabase-project-origin>`, since the browser Supabase
  client (`lib/supabase/browser-client.ts`) calls Supabase Auth directly for
  sign-in/sign-out.

Regression test: `supabase/scripts/regression/fix4-security-headers.ts`.

**Missing rate limiting on 15 write endpoints.** Added the existing
`checkRateLimit(key, limit, windowMs)` pattern (`lib/rate-limit.ts`, already
used by `connections/request`, `questions`, `mistakes`, `eca`, `reports`) to:

| Route | Limit | Window |
|---|---|---|
| `onboarding/username-check` | 30 | 60s |
| `connections/respond` | 30 | 1h |
| `connections/revoke` | 30 | 1h |
| `contacts` (POST) | 20 | 1h |
| `profile/update` | 20 | 1h |
| `blocks` (POST+DELETE, shared budget) | 30 | 1h |
| `account/delete` | 3 | 1h |
| `notifications` (POST mark-read) | 60 | 1h |
| `questions/[id]/upvote` | 30 | 60s |
| `eca/[id]/upvote` | 30 | 60s |
| `mistakes/[id]/upvote` | 30 | 60s |
| `timeline/[itemId]/toggle` | 30 | 60s |
| `admin/questions/[id]/moderate` | 20 | 5min |
| `admin/mistakes/[id]/moderate` | 20 | 5min |
| `admin/eca/[id]/moderate` | 20 | 5min |

Admin moderate routes use a tighter window than user-facing routes --
a compromised admin session hammering approve/reject is a distinct,
higher-stakes risk than a normal user spamming a toggle.

`lib/rate-limit.ts` had its `import "server-only"` removed (same rationale as
the earlier `getSupabaseAdmin()` fix: it throws outside the Next.js bundler,
which broke standalone `tsx` execution needed for these regression tests;
Next's own build-time env-stripping is the real boundary, not this import).

Regression tests: `supabase/scripts/regression/fix5-6-rate-limits-unit.ts`
(the shared module's 429-trigger and window-recovery behavior, tested
directly against the exact configs every route above uses) and
`fix6-rate-limits-http.ts` (end-to-end HTTP hammering against the running
server for the admin moderate routes and `account/delete` specifically, per
the higher scrutiny those two categories warranted).

### Low

**`postcss` XSS advisory (GHSA-qx2v-qp2m-jg93), via `next`'s nested
dependency.** `npm audit` flags this as moderate. Checked whether a newer
16.x patch resolves it: as of `next@16.2.10` (the latest published 16.x
patch at review time), the nested `postcss` is still the same vulnerable
version -- no patch bump fixes this without a major downgrade (`npm audit
fix --force` wants to downgrade to `next@9.3.3`, which is not viable; this
project is pinned to `16.2.9` per `AGENTS.md`).

**Accepted risk, not fixed.** `postcss`'s vulnerable code path is its CSS
*stringifier* mishandling `</style>` sequences during build-time CSS
processing -- it has no runtime code path in this app. This project doesn't
accept or process attacker-controlled CSS at runtime (Tailwind compiles a
static stylesheet at build time from the project's own source; no user input
is ever run through `postcss`). Re-check at the next dependency review, or
whenever `next` publishes a `16.x` patch that bumps its nested `postcss`
past `8.5.10`.

## Current `npm audit` state

```
2 moderate (next, and next's nested postcss -- see "Accepted risk" above)
0 critical, 0 high, 0 low
```

## Regression suite

`supabase/scripts/regression/` -- see that directory's `README.md` for how
to run each script and what it proves. No test runner is configured in this
project; these are standalone `tsx` scripts, matching the existing
`supabase/scripts/seed-*.ts` convention. All 7 scripts (46 assertions total)
pass together against the current codebase.

## What to revisit later

- **`postcss` advisory**: re-check at the next dependency review (see
  "Accepted risk" above).
- **Rate limiting is in-process, not distributed** (`lib/rate-limit.ts`'s own
  doc comment): fine at this project's current scale, but a multi-instance
  deployment would need a shared store (Redis/Upstash/Supabase-backed
  counter) for the limits to hold across instances.
