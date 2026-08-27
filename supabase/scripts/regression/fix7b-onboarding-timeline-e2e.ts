/**
 * Browser-driven checks for the batch-5 audit:
 *  C6 - Onboarding "year" step: applicationYear starts at 0 (nothing
 *       selected) and genuinely blocks the Next button until a year is
 *       clicked, for BOTH tracks; the years rendered match
 *       validApplicationYears(track) exactly.
 *  C7 - An existing account (simulating one created before this batch)
 *       with a now-invalid stored application_year: Home
 *       pages render the "cycle closed" messaging without throwing.
 *
 * Needs a running production build (`next start`), not `next dev`.
 * Needs `playwright` installed (temporarily, --no-save) with chromium
 * already fetched.
 *
 * Run:
 *   KMATE_BASE_URL=http://localhost:3901 npx tsx supabase/scripts/regression/fix7b-onboarding-timeline-e2e.ts
 */
import { chromium, type Browser } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, makeChecker, cleanupUser } from "./_env";

const env = loadEnvLocal();
const BASE_URL = process.env.KMATE_BASE_URL ?? "http://localhost:3901";
const PROJECT_REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const COOKIE_KEY = `sb-${PROJECT_REF}-auth-token`;
const CHUNK_SIZE = 3180;

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { check, summarize } = makeChecker();

function base64UrlEncode(str: string) {
  return Buffer.from(str, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function cookiesFor(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.action_link) throw new Error(`generateLink failed: ${error?.message}`);
  const res = await fetch(data.properties.action_link, { redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) throw new Error("no redirect location from magic link");
  const hash = new URLSearchParams(new URL(location).hash.slice(1));
  const plain = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: sessionData, error: setErr } = await plain.auth.setSession({
    access_token: hash.get("access_token")!,
    refresh_token: hash.get("refresh_token")!,
  });
  if (setErr || !sessionData.session) throw new Error(`setSession failed: ${setErr?.message}`);

  const encoded = "base64-" + base64UrlEncode(JSON.stringify(sessionData.session));
  const url = new URL(BASE_URL);
  if (encoded.length <= CHUNK_SIZE) {
    return [{ name: COOKIE_KEY, value: encoded, domain: url.hostname, path: "/" }];
  }
  const parts: { name: string; value: string; domain: string; path: string }[] = [];
  for (let i = 0, idx = 0; i < encoded.length; i += CHUNK_SIZE, idx++) {
    parts.push({ name: `${COOKIE_KEY}.${idx}`, value: encoded.slice(i, i + CHUNK_SIZE), domain: url.hostname, path: "/" });
  }
  return parts;
}

// Pure re-implementation of validApplicationYears, to compute the expected
// set independently of the app's own code (so this isn't just "does the
// app agree with itself").
function estimateApplicationDeadline(track: "gks_u" | "gks_g", applicationYear: number): Date {
  if (track === "gks_g") return new Date(applicationYear, 1, 15);
  return new Date(applicationYear - 1, 8, 30);
}
function expectedValidYears(track: "gks_u" | "gks_g"): number[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const candidates = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3];
  const years = candidates.filter((year) => estimateApplicationDeadline(track, year) > now);
  // Mirrors the same one-off 2026/gks_u carve-out in lib/deadline.ts
  // (GKS-U 2026 is still open past this estimate's cutoff) -- kept in sync
  // by hand since this is a deliberately independent reimplementation.
  if (track === "gks_u" && !years.includes(2026)) years.unshift(2026);
  return years;
}

async function runOnboardingToYearStep(browser: Browser, email: string, trackButtonName: string, username: string) {
  const cookies = await cookiesFor(email);
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/onboarding`, { waitUntil: "networkidle" });

  // Username step
  await page.getByPlaceholder("username").fill(username);
  await page.getByText("Available", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Next" }).click();

  // Bio step -- skip
  await page.getByRole("button", { name: "Skip for now" }).click();

  // Track step
  await page.getByRole("button", { name: trackButtonName }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Major step
  await page.getByPlaceholder("Search your major…").click();
  await page.getByPlaceholder("Search your major…").fill("Computer Science");
  await page.getByRole("button", { name: "Computer Science", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Universities step -- search broadly, add the first result.
  const uniSearch = page.getByPlaceholder("Search universities…");
  await uniSearch.fill("a");
  await page.waitForTimeout(500); // debounce
  const firstResult = page.locator("ul li button").first();
  await firstResult.waitFor({ timeout: 10000 });
  await firstResult.click();
  await page.getByRole("button", { name: "Next" }).click();

  // Now on the year step.
  return { context, page };
}

async function testC6Onboarding(browser: Browser) {
  console.log("\n=== C6: Onboarding year-step gating + valid years, both tracks ===");

  const cases: { track: "gks_u" | "gks_g"; buttonName: string }[] = [
    { track: "gks_u", buttonName: "Undergraduate (Bachelor's)" },
    { track: "gks_g", buttonName: "Graduate (Master's/PhD)" },
  ];

  for (const { track, buttonName } of cases) {
    const email = `e2e-c6-${track}-${Date.now()}@example.com`;
    const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (!created?.user) throw new Error(`createUser failed for C6/${track}`);
    try {
      const username = `e2ec6${track}${Date.now() % 100000}`;
      const { context, page } = await runOnboardingToYearStep(browser, email, buttonName, username);

      const nextButton = page.getByRole("button", { name: "Next" });
      const disabledBeforeSelection = await nextButton.isDisabled();
      check(`[${track}] Next button is disabled on the year step before any year is clicked (applicationYear=0)`, disabledBeforeSelection);

      const yearButtons = page.locator("div.mt-4.flex.gap-2 > button");
      const shownYears = (await yearButtons.allTextContents()).map((t: string) => Number(t.trim())).sort((a: number, b: number) => a - b);
      const expected = expectedValidYears(track).sort((a, b) => a - b);
      check(
        `[${track}] years shown on the year step (${shownYears.join(",")}) match validApplicationYears independently computed (${expected.join(",")})`,
        JSON.stringify(shownYears) === JSON.stringify(expected)
      );

      if (shownYears.length > 0) {
        const selectedYear = shownYears[0];
        await yearButtons.first().click();
        const enabledAfterSelection = await nextButton.isEnabled();
        check(`[${track}] Next button becomes enabled once a year is clicked`, enabledAfterSelection);

        // Continue through to actual submission -- confirms the new
        // server-side validApplicationYears check on /api/onboarding/complete
        // doesn't reject a year that came from its own UI's option list.
        await nextButton.click(); // contacts step (all optional, Next stays enabled)
        await nextButton.click(); // -> review step
        await page.getByRole("button", { name: "Finish setup" }).click();
        await page.waitForURL(`${BASE_URL}/home`, { timeout: 15000 });

        const { data: finalProfile } = await admin.from("profiles").select("application_year, track, onboarding_completed_at").eq("id", created.user.id).maybeSingle();
        check(
          `[${track}] onboarding actually completes with a valid year (${selectedYear}) chosen from the UI's own list -- redirected home, profile stored with that year`,
          finalProfile?.application_year === selectedYear && finalProfile?.track === track && finalProfile?.onboarding_completed_at !== null
        );
      }

      await context.close();
    } finally {
      await cleanupUser(admin, created.user.id);
    }
  }
}

async function testC7StaleAccount(browser: Browser) {
  console.log("\n=== C7: Existing account with now-invalid stored application_year ===");
  const email = `e2e-c7-stale-${Date.now()}@example.com`;
  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (!created?.user) throw new Error("createUser failed for C7");
  const userId = created.user.id;

  try {
    // Simulate an account onboarded a prior cycle, back when 2025 was still
    // a selectable GKS-U year (2026 no longer works for this -- it's a
    // currently-valid year again per the carve-out in deadline.ts).
    const { error: upsertErr } = await admin.from("profiles").upsert({
      id: userId,
      username: `e2ec7stale${Date.now() % 100000}`,
      track: "gks_u",
      major: "Computer Science",
      application_year: 2025,
      onboarding_completed_at: new Date().toISOString(),
    });
    if (upsertErr) throw new Error(`profile upsert failed: ${upsertErr.message}`);

    const cookies = await cookiesFor(email);
    const context = await browser.newContext();
    await context.addCookies(cookies);
    const page = await context.newPage();

    const homeErrors: string[] = [];
    page.on("pageerror", (e: Error) => homeErrors.push(String(e)));
    const homeRes = await page.goto(`${BASE_URL}/home`, { waitUntil: "networkidle" });
    const homeBody = await page.content();
    check(
      "Home page for stale application_year=2025 (gks_u) account: loads (200), no client-side error, shows 'cycle has passed' messaging",
      (homeRes?.status() ?? 0) === 200 &&
        homeErrors.length === 0 &&
        homeBody.includes("This application cycle") &&
        homeBody.includes("deadline has passed")
    );
    check("Home page: does NOT show a negative/nonsensical day countdown for the stale account", !/was due -?\d+ days? ago/i.test(homeBody) && !/-\d+ day/i.test(homeBody));

    // The /timeline route was removed with the Timeline feature; the stale
    // application_year nudge it used to assert is covered on Home above.

    await context.close();
  } finally {
    await cleanupUser(admin, userId);
  }
}

async function main() {
  const browser = await chromium.launch();
  try {
    await testC6Onboarding(browser);
    await testC7StaleAccount(browser);
  } finally {
    await browser.close();
  }
  if (!summarize()) process.exit(1);
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
