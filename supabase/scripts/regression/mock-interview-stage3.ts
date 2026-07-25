/**
 * Stage 3 functional check: the API key screen is the first thing shown
 * (not setup), the guide renders real content (including the extracted
 * screenshot images actually loading, not 404ing), and key validation makes
 * a REAL network call to Gemini -- verified via the invalid-key path, which
 * doesn't require a real API key to exercise honestly. The valid-key path
 * (proceeding to setup) is NOT covered here -- there's no real Gemini key
 * available in this environment to test it against the actual API.
 *
 * Run: npx tsx supabase/scripts/regression/mock-interview-stage3.ts
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
  const user = await createThrowawayUser(admin, "mockinterviewstage3");
  const browser = await chromium.launch();
  try {
    const session = await sessionFor(user.email);
    const encoded = "base64-" + b64(JSON.stringify(session));

    const context = await browser.newContext({ baseURL: BASE_URL });
    await context.addCookies([{ name: COOKIE_KEY, value: encoded, url: BASE_URL }]);
    const page = await context.newPage();
    const cspViolations: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().toLowerCase().includes("content security policy")) cspViolations.push(msg.text());
    });

    // Response header check via a real authenticated navigation (the CSP
    // header is only attached to the final authenticated response in
    // proxy.ts, not the early unauthenticated-redirect path).
    const navResponse = await page.goto("/interview-db/mock-interview", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800); // hydration buffer, same as Stage 2's test

    const csp = navResponse?.headers()["content-security-policy"] ?? "";
    check("CSP connect-src includes Gemini's API origin", csp.includes("generativelanguage.googleapis.com"));
    check("CSP connect-src still includes MediaPipe origins from Stage 2", csp.includes("cdn.jsdelivr.net") && csp.includes("storage.googleapis.com"));

    const bodyText = await page.textContent("body");
    check("API key screen shown FIRST, not setup", (bodyText ?? "").includes("API key needed") && !(bodyText ?? "").includes("Set up your interview"));
    check("Guide is expanded by default", (bodyText ?? "").includes("Go to Google AI Studio and click the key icon"));

    // Verify the extracted screenshot images actually load (not 404ing) --
    // real HTTP requests to /mock-interview/*.jpg under this same page.
    const imgResults = await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll("img")).filter((i) => i.src.includes("/mock-interview/api-key-guide"));
      return Promise.all(
        imgs.map(async (img) => {
          if (img.complete && img.naturalWidth > 0) return { src: img.src, ok: true };
          return new Promise<{ src: string; ok: boolean }>((resolve) => {
            img.addEventListener("load", () => resolve({ src: img.src, ok: img.naturalWidth > 0 }), { once: true });
            img.addEventListener("error", () => resolve({ src: img.src, ok: false }), { once: true });
            setTimeout(() => resolve({ src: img.src, ok: img.naturalWidth > 0 }), 5000);
          });
        })
      );
    });
    check("All 8 guide screenshots present", imgResults.length === 8);
    check("All guide screenshots actually loaded (no 404s)", imgResults.every((r) => r.ok));
    if (!imgResults.every((r) => r.ok)) console.log("    broken images:", imgResults.filter((r) => !r.ok));

    // Toggle the guide closed.
    await page.click("text=Hide guide ↑");
    check("Guide collapses on toggle", !(await page.textContent("body"))?.includes("Go to Google AI Studio and click the key icon"));

    // Empty-key validation error (no network call needed).
    await page.click("text=Validate & continue");
    await page.waitForTimeout(300);
    check("Empty key shows 'paste a key first' error", (await page.textContent("body"))?.includes("Please paste a key first.") ?? false);

    // Invalid-key validation -- a REAL network call to Gemini's API, over
    // the newly-allowed CSP origin. Confirms both the CSP fix and the
    // error-handling branch work against the real endpoint, without
    // needing a real API key.
    await page.fill('input[placeholder="AIza..."]', "AIzaFAKE_INVALID_KEY_FOR_TESTING_00000");
    await page.click("text=Validate & continue");
    await page.waitForSelector("text=Key validation failed", { timeout: 15000 });
    check("Invalid key produces a real error from Gemini's API (not a CSP block, not a generic message)", true);
    const errorText = await page.textContent("body");
    check("Error message includes the real HTTP status code", /Key validation failed \(\d+\)/.test(errorText ?? ""));

    check("No CSP violations logged in the console during the whole flow", cspViolations.length === 0);
    if (cspViolations.length) console.log("    CSP violations:", cspViolations);

    await context.close();
  } finally {
    await browser.close();
    await admin.from("interview_sessions").delete().eq("user_id", user.userId);
    await cleanupUser(admin, user.userId);
  }

  if (!summarize()) process.exit(1);
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
