/**
 * Regression test for Fix 4 (Phase 3, medium): confirms the security headers
 * from next.config.ts and the nonce-based CSP from proxy.ts are present on a
 * real response. Does not re-verify browser-level CSP compatibility (inline
 * scripts/styles) -- that was checked once with Playwright against a forged
 * session covering public, authenticated, and admin pages; rerunning that
 * check isn't part of this lightweight suite.
 *
 * Requires a running server, and specifically a PRODUCTION build
 * (`next build && next start`) for the Strict-Transport-Security assertion,
 * which is gated on NODE_ENV=production.
 *
 * Run: KMATE_BASE_URL=http://localhost:3901 npx tsx supabase/scripts/regression/fix4-security-headers.ts
 */
import { makeChecker } from "./_env";

const BASE_URL = process.env.KMATE_BASE_URL ?? "http://localhost:3901";
const { check, summarize } = makeChecker();

async function main() {
  const res = await fetch(`${BASE_URL}/`);
  const headers = res.headers;

  check("X-Frame-Options: DENY", headers.get("x-frame-options") === "DENY");
  check("X-Content-Type-Options: nosniff", headers.get("x-content-type-options") === "nosniff");
  check(
    "Referrer-Policy: strict-origin-when-cross-origin",
    headers.get("referrer-policy") === "strict-origin-when-cross-origin"
  );
  const permissionsPolicy = headers.get("permissions-policy") ?? "";
  check(
    "Permissions-Policy present and disables camera/microphone/geolocation",
    /camera=\(\)/.test(permissionsPolicy) &&
      /microphone=\(\)/.test(permissionsPolicy) &&
      /geolocation=\(\)/.test(permissionsPolicy)
  );
  check(
    "Strict-Transport-Security present (production build only)",
    /max-age=\d+/.test(headers.get("strict-transport-security") ?? "")
  );

  const csp = headers.get("content-security-policy") ?? "";
  check("CSP present with default-src 'self'", csp.includes("default-src 'self'"));
  const scriptSrc = /script-src ([^;]+)/.exec(csp)?.[1] ?? "";
  check(
    "CSP script-src uses a nonce and strict-dynamic (not unsafe-inline)",
    /'nonce-[^']+'/.test(scriptSrc) && scriptSrc.includes("strict-dynamic") && !scriptSrc.includes("unsafe-inline")
  );
  check(
    "CSP style-src is 'self' 'unsafe-inline' (documented Framer Motion accommodation)",
    /style-src 'self' 'unsafe-inline'/.test(csp)
  );
  check("CSP frame-ancestors 'none' (clickjacking defense-in-depth alongside X-Frame-Options)",
    csp.includes("frame-ancestors 'none'")
  );

  if (!summarize()) process.exit(1);
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
