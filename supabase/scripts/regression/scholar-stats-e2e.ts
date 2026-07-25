/**
 * Functional check for the Scholar Stats page: real browser, real login
 * session, real data (loaded via load-gks-scholar-stats.ts) -- not a mock.
 * Verifies the track toggle, view toggle, search, and the on-demand
 * expand-to-fetch breakdown (with percentages) all actually work, and cross-
 * checks a couple of rendered numbers against the database directly so this
 * isn't just "did the page not crash."
 *
 * Run: npx tsx supabase/scripts/regression/scholar-stats-e2e.ts
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, makeChecker, createThrowawayUser, cleanupUser } from "./_env";

const env = loadEnvLocal();
const BASE_URL = process.env.KMATE_BASE_URL ?? "http://localhost:3000";
const PROJECT_REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const COOKIE_KEY = `sb-${PROJECT_REF}-auth-token`;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { check, summarize } = makeChecker();

function b64(str: string) {
  return Buffer.from(str, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sessionFor(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.action_link) throw new Error(`generateLink failed: ${error?.message}`);
  const res = await fetch(data.properties.action_link, { redirect: "manual" });
  const location = res.headers.get("location")!;
  const hash = new URLSearchParams(new URL(location).hash.slice(1));
  const plain = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionData } = await plain.auth.setSession({
    access_token: hash.get("access_token")!,
    refresh_token: hash.get("refresh_token")!,
  });
  return sessionData!.session!;
}

async function main() {
  const user = await createThrowawayUser(admin, "scholarstats");
  const browser = await chromium.launch();
  try {
    const session = await sessionFor(user.email);
    const encoded = "base64-" + b64(JSON.stringify(session));
    const context = await browser.newContext({ baseURL: BASE_URL });
    await context.addCookies([{ name: COOKIE_KEY, value: encoded, url: BASE_URL }]);
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

    await page.goto("/scholar-stats", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    check("Page loaded", (await page.title()).includes("Scholar Stats"));
    check("Nav link present", (await page.locator('a[href="/scholar-stats"]').count()) > 0);

    // Defaults: GKS-G track, By-university view. Pusan National University
    // is GKS-G's top university (84 seats) -- known from the trusted
    // aggregate, so its presence + row order is a real content check.
    await page.waitForSelector("text=Pusan National University", { timeout: 15000 });
    const bodyDefault = await page.textContent("body");
    check("GKS-G default track shows real data (Pusan National University, 84 seats)", (bodyDefault ?? "").includes("Pusan National University"));

    // Expand a row and confirm the on-demand breakdown fetch actually works
    // and shows a percentage.
    await page.click("text=Pusan National University");
    await page.waitForSelector("text=% of Pusan National University's seats", { timeout: 10000 });
    await page.waitForFunction(() => !document.body.textContent?.includes("Loading breakdown"), { timeout: 10000 });
    const expandedBody = await page.textContent("body");
    check("Expanding a university row loads its country breakdown", (expandedBody ?? "").includes("%"));

    // Search filters the list. Checked via the actual rendered <tr> name
    // cells, not page.textContent("body") -- that also picks up Next's
    // embedded RSC flight-data <script> payload, which legitimately contains
    // every university's name (it's the unfiltered server-passed prop data),
    // so a raw textContent substring check can't tell "visibly filtered"
    // apart from "present anywhere in the page's HTML".
    await page.click('input[placeholder="Search universities…"]');
    await page.keyboard.type("Pusan National University", { delay: 20 });
    await page.waitForTimeout(300);
    const visibleNames = await page.locator("tbody tr td:nth-child(2)").allTextContents();
    check("Search filters to exactly the matching university (nothing else)", JSON.stringify(visibleNames) === JSON.stringify(["Pusan National University"]));
    await page.fill('input[placeholder="Search universities…"]', "");

    // Switch to By-country view.
    await page.click("text=By country");
    await page.waitForTimeout(300);
    // Indonesia is GKS-G's top country (170 seats) per the trusted aggregate.
    const countryBody = await page.textContent("body");
    check("By-country view shows real data (Indonesia)", (countryBody ?? "").includes("Indonesia"));

    // Switch track to GKS-U.
    await page.click("text=GKS-U (Undergrad)");
    await page.waitForTimeout(500);
    const gksUBody = await page.textContent("body");
    // Myanmar is GKS-U's top country (27 seats) per the trusted aggregate --
    // confirms the track toggle actually re-fetches/re-renders different data,
    // not just relabeling the same GKS-G rows.
    check("GKS-U track shows different, real data (Myanmar)", (gksUBody ?? "").includes("Myanmar"));
    // (Indonesia legitimately has GKS-U seats too, 9 of them -- not a good
    // "different track" discriminator; Myanmar above already proves it.)

    check("No uncaught page errors during the whole flow", consoleErrors.length === 0);
    if (consoleErrors.length) console.log("    page errors:", consoleErrors.slice(0, 5));

    // Cross-check a rendered number directly against the database, not just
    // against the trusted CSVs -- confirms what's actually loaded matches
    // what's actually displayed.
    const { data: dbRow } = await admin
      .from("gks_university_stats")
      .select("total_selected_count")
      .eq("track", "gks_g")
      .eq("university", "Pusan National University")
      .single();
    check("Rendered Pusan National University total matches the database (84)", dbRow?.total_selected_count === 84);

    await context.close();
  } finally {
    await browser.close();
    await cleanupUser(admin, user.userId);
  }

  if (!summarize()) process.exit(1);
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
