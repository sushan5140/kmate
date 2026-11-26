# KMate Phase 3 — integration release gate

This branch integrates P3.1, P3.2 (including its test typecheck fix), P3.3, P3.4, P3.5, P3.6 and P3.7. The previous feature PRs are superseded for integration review; do not merge them independently after this branch merges.

| Phase | Implementation |
|---|---|
| P3.1 | GKS-G pre-cycle roadmap with historical/current cycle boundary and local task completion |
| P3.2 | Manual professor and lab tracker, local follow-up dates, search, edit, remove, clear |
| P3.3 | Self-reported selection stages in the saved application dashboard, scoped by application configuration and cycle |
| P3.4 | Department verification worksheet within checked university results; manual source URL/date and unknown/action/reviewed states |
| P3.5 | Evidence-first personal statement and study plan workspace in Application Readiness; draft prompts and word counts, no AI generation |
| P3.6 | Recipient-specific manual document packet worksheet; no file inspection, no official certification |
| P3.7 | Feature-gated mutual-consent peer matching, with staged SQL and authenticated API |

P3.4–P3.6 are account-scoped browser-local notes. No new upload or AI endpoints. Guests may inspect the worksheet but cannot save. Explicit cycle selection and configuration keys avoid reuse across different application contexts. The older saved-application store itself predates P3 and is browser-local rather than account-scoped; a broader storage redesign is not included.

## Release gates
1. Require full Verify KMate CI: lint, TypeScript, GKS integrity, readiness and all P3 model regressions, release audit and production build.
2. Browser smoke against a non-production build: mobile 320/390 and desktop, guests cannot write new tools; authenticated synthetic account can save/reload/edit/clear, and changing account/cycle/route never displays another scope's data. Check failure handling for blocked local storage and cross-tab updates. No real applicant data.
3. Confirm privacy copy and current source links; no automatic official decision, deadline, eligibility or document validation is claimed.
4. Keep `KMATE_STAGE_MATCHING_ENABLED` unset or false until P3.7 passes the separate gate below.
5. Deploy only after checks; do not merge prior individual PRs in addition to this integration branch.

## P3.7 database gate (not applied)
The staged SQL is `supabase/staged/p3_7_stage_matching.sql`. It is a candidate, not a generated or applied migration. The local Supabase CLI and full Git checkout are unavailable in this execution environment. Generate the actual migration in a disposable Supabase environment using the CLI and review the resulting SQL. No production schema or environment variable was changed.

- Test as anon and authenticated roles: neither direct table access nor RPC execution is permitted.
- Test as server service role with isolated synthetic accounts: mutual active consent, same program/cycle/university/stage only; exclude self, blocked pairs in either direction, expired consents, mismatched profiles, deleted profiles, changed onboarding version and deleted/replaced university choices.
- Verify opt-in rejects foreign choice IDs, invalid stages, missing consent, guest sessions and cross-origin requests. Verify revocation removes preference; disable the flag and verify no peer results and direct-page revocation for existing preferences.
- Confirm DB advisors, service-role-only grants, RLS, RPC security invoker and restricted search path. Confirm retention cleanup policy for expired rows before enablement; expiry stops matching but does not remove the row.
- Only then enable the server-side flag in a preview and perform two-account browser tests. The pilot should not be activated merely because TypeScript builds.
