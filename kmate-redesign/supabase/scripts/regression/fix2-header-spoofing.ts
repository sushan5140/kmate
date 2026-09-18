/**
 * Regression test for the HIGH finding fixed in Phase 2: proxy.ts only ever
 * *set* the x-kmate-user-id header inside `if (user)`, never clearing it
 * first -- so a request with no session at all, but a client-supplied
 * x-kmate-user-id header, would have that spoofed value pass straight
 * through to AppShell, which trusts the header as "the verified signed-in
 * user". Fixed by unconditionally deleting the header at the top of
 * proxy.ts before anything else runs.
 *
 * Requires a running server (build + `next start`, since proxy.ts's CSP
 * nonce logic requires dynamic rendering -- `next dev` works too).
 *
 * Run: KMATE_BASE_URL=http://localhost:3901 npx tsx supabase/scripts/regression/fix2-header-spoofing.ts
 */
import { makeChecker } from "./_env";

const BASE_URL = process.env.KMATE_BASE_URL ?? "http://localhost:3901";
const { check, summarize } = makeChecker();

async function main() {
  const res = await fetch(`${BASE_URL}/`, {
    headers: { "x-kmate-user-id": "00000000-0000-0000-0000-000000000000" },
  });
  const body = await res.text();

  // No real session was ever established -- if the spoofed header were
  // trusted, AppShell would render the authenticated sidebar/topbar instead
  // of the public marketing Navbar, which is the only place "Sign in" (see
  // components/layout/navbar.tsx) appears.
  check(
    "spoofed x-kmate-user-id header with no session renders the public (signed-out) nav, not an authenticated one",
    res.status === 200 && body.includes("Sign in")
  );

  if (!summarize()) process.exit(1);
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
