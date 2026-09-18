import { checkRateLimit } from "@/lib/rate-limit";

// Proves both halves of Fix 5/6 for the shared rate-limit module using the
// exact (limit, windowMs) tuples each route calls it with. HTTP-level 429
// triggering for the admin moderate + account/delete routes is covered
// separately in _tmp-regression-fix6-http.ts; recovery-after-window is
// proven here by advancing Date.now() rather than sleeping for real (some
// routes use a 1-hour window, which isn't practical to wait out).

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`PASS: ${label}`);
  } else {
    fail++;
    console.log(`FAIL: ${label}`);
  }
}

function testConfig(label: string, limit: number, windowMs: number) {
  const key = `test:${label}:${Math.random()}`;
  const realNow = Date.now;

  let allowedCount = 0;
  for (let i = 0; i < limit; i++) {
    if (checkRateLimit(key, limit, windowMs).allowed) allowedCount++;
  }
  check(`${label}: first ${limit} requests all allowed`, allowedCount === limit);

  const blocked = checkRateLimit(key, limit, windowMs);
  check(`${label}: request ${limit + 1} is blocked (429)`, blocked.allowed === false);
  check(`${label}: blocked response carries a positive retryAfterSeconds`, blocked.retryAfterSeconds > 0);

  // Fast-forward past the window without sleeping for real.
  Date.now = () => realNow() + windowMs + 1000;
  const recovered = checkRateLimit(key, limit, windowMs);
  check(`${label}: allowed again once the window has fully elapsed`, recovered.allowed === true);
  Date.now = realNow;
}

// Matches the exact configs used in the routes added this phase.
testConfig("username-check(30/60s)", 30, 60 * 1000);
testConfig("upvote(30/60s)", 30, 60 * 1000);
testConfig("moderate(20/5min)", 20, 5 * 60 * 1000);
testConfig("account-delete(3/1hr)", 3, 60 * 60 * 1000);
testConfig("profile-update(20/1hr)", 20, 60 * 60 * 1000);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
