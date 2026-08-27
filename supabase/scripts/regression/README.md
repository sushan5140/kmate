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

## Running

```bash
# No server needed:
npx tsx supabase/scripts/regression/fix1-admin-escalation.ts
npx tsx supabase/scripts/regression/fix3-connection-requests.ts
npx tsx supabase/scripts/regression/fix5-6-rate-limits-unit.ts
npx tsx --conditions react-server supabase/scripts/regression/readiness-checks.ts

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
