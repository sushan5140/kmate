/**
 * Gated-route redirect (`next=`) checks.
 *
 * Run with:  npx tsx --conditions react-server supabase/scripts/regression/safe-next-checks.ts
 *
 * Two properties, pulling in opposite directions:
 *   1. the full destination -- pathname AND query -- survives the round trip
 *   2. `next` can never leave this origin
 *
 * The second must not be weakened to achieve the first, so every loosening of
 * the encoding rules below is paired with an explicit attack case.
 */
import fs from "node:fs";
import path from "node:path";
import {
  isSafeNext,
  sanitizeNext,
  destinationFrom,
  buildLoginUrl,
  withNext,
  DEFAULT_NEXT,
} from "@/lib/auth/safe-next";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + m);
  if (!c) fail++;
};

const REPO = path.join(__dirname, "..", "..", "..");

/** The exact journey a gated route takes: request -> /login?next= -> back. */
function roundTrip(requested: string): string {
  const u = new URL(requested, "https://kmate.vercel.app");
  const destination = destinationFrom(u);
  const loginUrl = buildLoginUrl(destination);
  // What /login and /auth/callback then read back out of the query string.
  const parsed = new URL(loginUrl, "https://kmate.vercel.app");
  return sanitizeNext(parsed.searchParams.get("next"));
}

// -------------------------------------------------------------------------
console.log("=== 1/2/3/4. query strings survive the round trip exactly ===");
// -------------------------------------------------------------------------
const ROUND_TRIPS = [
  "/notices?view=gks&program=GKS-U&track=embassy",
  "/notices?view=gks&program=GKS-G&track=university&type=result",
  "/requirement-checker?program=GKS-G&track=university",
  "/application-readiness?program=GKS-U&track=embassy&uni=Yonsei",
  "/home",
  "/notices",
  "/interview-db/mock-interview?stage=3",
  "/profile/some.user",
];
for (const r of ROUND_TRIPS) {
  ok(roundTrip(r) === r, `round trip preserved: ${r}`);
}

console.log("=== repeated params survive in order ===");
// Application Readiness pairs uni/maj positionally, so both the COUNT and the
// ORDER of repeats have to survive -- dropping or reordering one silently
// re-pairs a university with the wrong major.
// NOTE on ordering: Next.js normalises the query string before any proxy code
// runs, regrouping repeated keys (uni=A&maj=1&uni=B&maj=2 arrives already as
// uni=A&uni=B&maj=1&maj=2). That is upstream of this helper and cannot be read
// around -- request.url is normalised identically. What matters is asserted
// below: nothing is dropped, and the order WITHIN each key is preserved, which
// is exactly what /application-readiness's index-based uni/maj pairing needs.
const repeated = "/application-readiness?program=GKS-U&track=embassy&uni=Yonsei&uni=Korea&uni=Ewha&maj=CS&maj=IR&maj=";
ok(roundTrip(repeated) === repeated, "three uni/maj pairs survive verbatim");
const back = new URL(roundTrip(repeated), "https://kmate.invalid");
ok(back.searchParams.getAll("uni").join(",") === "Yonsei,Korea,Ewha", "repeated uni values kept in order");
ok(back.searchParams.getAll("maj").join(",") === "CS,IR,", "repeated maj values kept, including the empty one");
ok(back.searchParams.getAll("uni").length === 3, "no repeated param is collapsed");

// The helper itself is order-faithful: given an interleaved query it returns it
// byte-identical. (Next's own normalisation happens before this is ever called.)
const interleaved = "/application-readiness?uni=Yonsei&maj=CS&uni=Korea&maj=IR";
ok(roundTrip(interleaved) === interleaved, "the helper preserves interleaved order byte-for-byte");

console.log("=== encoding is applied exactly once ===");
const encoded = buildLoginUrl("/notices?view=gks&program=GKS-U&track=embassy");
ok(
  encoded === "/login?next=%2Fnotices%3Fview%3Dgks%26program%3DGKS-U%26track%3Dembassy",
  "login URL matches the specified shape: " + encoded
);
ok(!/[?&]view=/.test(encoded), "the destination's own params are NOT siblings of next (the production bug)");
ok((encoded.match(/\?/g) ?? []).length === 1, "exactly one literal '?' -- the login URL's own");
const spaces = "/notices?q=hello%20world&tag=a%2Bb";
ok(roundTrip(spaces) === spaces, "already-encoded values are not double-decoded: " + roundTrip(spaces));
const unicode = "/notices?q=" + encodeURIComponent("한국정부초청");
ok(roundTrip(unicode) === unicode, "percent-encoded unicode survives");

// -------------------------------------------------------------------------
console.log("=== 6/7/8. external and hostile targets are rejected ===");
// -------------------------------------------------------------------------
const HOSTILE = [
  "https://evil.com",
  "http://evil.com",
  "//evil.com",
  "///evil.com",
  "\\\\evil.com",
  "/\\evil.com",
  "/\\/evil.com",
  "javascript:alert(1)",
  "/javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "https:/evil.com",
  "https:evil.com",
  "//evil.com/path?a=b",
  "/\thttps://evil.com",
  "/\nhttps://evil.com",
  "/\rhttp://evil.com",
  "/%0d%0aSet-Cookie:x=1",
  "",
  "   ",
  "notaslash",
  "./relative",
  "../escape",
];
for (const h of HOSTILE) {
  const label = JSON.stringify(h);
  ok(!isSafeNext(h), `rejected: ${label}`);
  ok(sanitizeNext(h) === DEFAULT_NEXT, `  falls back to ${DEFAULT_NEXT}: ${label}`);
}
ok(!isSafeNext(null) && !isSafeNext(undefined), "null/undefined rejected");
ok(sanitizeNext(null) === DEFAULT_NEXT, "null falls back safely");
ok(!isSafeNext("/" + "a".repeat(3000)), "an absurdly long value is rejected");

console.log("=== a decoded external target never becomes safe ===");
// The value is tested as given and used as given -- never decoded and
// re-tested, which is how %2f%2f bypasses appear.
for (const e of ["/%2f%2fevil.com", "/%2F%2Fevil.com", "/%5c%5cevil.com", "%2f%2fevil.com"]) {
  const s = sanitizeNext(e);
  const resolved = new URL(s, "https://kmate.invalid");
  ok(resolved.origin === "https://kmate.invalid", `stays on-origin after resolution: ${e} -> ${s}`);
}
ok(
  new URL(sanitizeNext("/%2f%2fevil.com"), "https://kmate.invalid").hostname === "kmate.invalid",
  "an encoded double slash cannot reach another host"
);

// -------------------------------------------------------------------------
console.log("=== 9. ordinary internal paths with queries are accepted ===");
// -------------------------------------------------------------------------
const SAFE = [
  "/home",
  "/notices?view=gks",
  "/notices?view=gks&program=GKS-U&track=embassy",
  "/requirement-checker?program=GKS-G&track=university&check=1",
  "/application-readiness?uni=A&uni=B",
  "/profile/user.name",
  "/interview-db?q=test",
  "/gks?q=%EA%B5%AD%EB%B9%84",
  "/notices#section",
  "/notices?view=gks#top",
  "/a/b/c/d",
];
for (const p of SAFE) {
  ok(isSafeNext(p), `accepted: ${p}`);
  ok(sanitizeNext(p) === p, `  passed through unchanged: ${p}`);
}

// -------------------------------------------------------------------------
console.log("=== 5. plain paths keep their existing behaviour ===");
// -------------------------------------------------------------------------
ok(buildLoginUrl("/home") === "/login?next=%2Fhome", "/home -> /login?next=%2Fhome, unchanged from before");
ok(roundTrip("/home") === "/home", "and returns to /home");
ok(sanitizeNext(undefined) === "/home", "a missing next still falls back to /home");

console.log("=== 10. the destination rides through onboarding ===");
ok(
  withNext("/onboarding", "/notices?view=gks&program=GKS-U") ===
    "/onboarding?next=%2Fnotices%3Fview%3Dgks%26program%3DGKS-U",
  "onboarding carries the destination"
);
ok(withNext("/onboarding", "/home") === "/onboarding", "the default destination is not appended -- URLs stay clean");
ok(withNext("/onboarding", "//evil.com") === "/onboarding", "a hostile destination is dropped, not carried");
ok(withNext("/onboarding", null) === "/onboarding", "a missing destination is fine");
const throughOnboarding = sanitizeNext(
  new URL(withNext("/onboarding", "/notices?view=gks&track=embassy"), "https://kmate.invalid").searchParams.get("next")
);
ok(throughOnboarding === "/notices?view=gks&track=embassy", "and it survives being read back out");

console.log("=== destinationFrom composes pathname + search ===");
ok(destinationFrom({ pathname: "/notices", search: "?a=1&b=2" }) === "/notices?a=1&b=2", "pathname + search");
ok(destinationFrom({ pathname: "/home", search: "" }) === "/home", "empty search adds nothing");
ok(destinationFrom({ pathname: "/home" }) === "/home", "absent search adds nothing");
ok(destinationFrom({ pathname: "/n", search: "?a=1", hash: "#h" }) === "/n?a=1#h", "hash included when present");

// -------------------------------------------------------------------------
console.log("=== the fix is shared, not per-route ===");
// -------------------------------------------------------------------------
const read = (f: string) => fs.readFileSync(path.join(REPO, f), "utf-8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const proxySrc = stripComments(read("proxy.ts"));
ok(/destinationFrom\(request\.nextUrl\)/.test(proxySrc), "proxy builds the destination from the full URL");
ok(/buildLoginUrl\(destination\)/.test(proxySrc), "proxy uses the shared login-URL builder");
ok(!/searchParams\.set\("next", request\.nextUrl\.pathname\)/.test(proxySrc), "proxy no longer writes a bare pathname");
ok(/request\.headers\.delete\("x-kmate-url"\)/.test(proxySrc), "proxy strips any client-supplied x-kmate-url first");
ok(/request\.headers\.set\("x-kmate-url", destination\)/.test(proxySrc), "and forwards the real destination to Server Components");
const deleteAt = proxySrc.indexOf('delete("x-kmate-url")');
const setAt = proxySrc.indexOf('set("x-kmate-url"');
ok(deleteAt !== -1 && setAt !== -1 && deleteAt < setAt, "the strip happens BEFORE the trusted set -- no spoofing window");

const authSrc = stripComments(read("lib/supabase/auth-server.ts"));
ok(/x-kmate-url/.test(authSrc), "requireOnboarded reads the real URL rather than only its literal argument");
ok(/buildLoginUrl\(destination\)/.test(authSrc), "and builds the login URL through the shared helper");
ok(/withNext\("\/onboarding", destination\)/.test(authSrc), "and carries the destination into onboarding");

const loginSrc = stripComments(read("app/login/page.tsx"));
ok(/sanitizeNext\(next\)/.test(loginSrc), "login validates through the shared helper");
ok(!/next\.startsWith\("\/"\)/.test(loginSrc), "and no longer relies on the startsWith check that allowed //evil.com");

const callbackSrc = stripComments(read("app/auth/callback/route.ts"));
ok(/sanitizeNext\(searchParams\.get\("next"\)\)/.test(callbackSrc), "the OAuth callback now validates next (it previously did not at all)");

const onboardingSrc = stripComments(read("app/onboarding/page.tsx"));
ok(/sanitizeNext\(next\)/.test(onboardingSrc), "onboarding validates its next");
ok(/destination=\{destination\}/.test(onboardingSrc), "and hands the validated destination to the wizard");

console.log("=== no gated page had to change ===");
// The whole point of routing this through the proxy header: not one of the
// ~20 requireOnboarded() call sites needed editing.
for (const f of ["app/notices/page.tsx", "app/requirement-checker/page.tsx", "app/application-readiness/page.tsx", "app/home/page.tsx"]) {
  ok(/requireOnboarded\("\/[^"]*"\)/.test(read(f)), `${f} still calls requireOnboarded with its literal, untouched`);
}

console.log("");
console.log(fail ? fail + " FAILURES" : "ALL SAFE-NEXT CHECKS PASSED");
process.exit(fail ? 1 : 0);
