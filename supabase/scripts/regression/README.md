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

## Running

```bash
# No server needed:
npx tsx supabase/scripts/regression/fix1-admin-escalation.ts
npx tsx supabase/scripts/regression/fix3-connection-requests.ts
npx tsx supabase/scripts/regression/fix5-6-rate-limits-unit.ts

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
```

`fix6-rate-limits-http.ts`'s admin-moderate check needs `KMATE_ADMIN_EMAIL`
pointing at an account that is *already* `is_admin = true` -- promote one
with `supabase/scripts/bootstrap-admin.ts` (see SECURITY.md "Admin
bootstrap") if none exists yet. It deliberately doesn't promote one itself;
this test is about rate limiting, not admin bootstrapping, and shouldn't
carry that side effect. Without `KMATE_ADMIN_EMAIL` set, that one check is
skipped; the `account/delete` check in the same file still runs.
