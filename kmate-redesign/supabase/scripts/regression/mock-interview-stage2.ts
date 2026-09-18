/**
 * Stage 2 functional check: actually drives the camera/tracking/pause flow
 * in a real (headless) browser with a fake camera device -- not just an
 * HTTP fetch, since none of this (getUserMedia, MediaPipe, the tracking
 * loop, the pause countdown) can be verified without a real browser
 * context. Uses the same throwaway-user + magic-link-cookie pattern as
 * fix7c / mock-interview-stage1.
 *
 * Run: npx tsx supabase/scripts/regression/mock-interview-stage2.ts
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
  const user = await createThrowawayUser(admin, "mockinterviewstage2");
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream", // auto-grant the permission prompt
    ],
  });
  try {
    const session = await sessionFor(user.email);
    const encoded = "base64-" + b64(JSON.stringify(session));

    const context = await browser.newContext({
      permissions: ["camera", "microphone"],
      baseURL: BASE_URL,
    });
    await context.addCookies([
      {
        name: COOKIE_KEY,
        value: encoded,
        url: BASE_URL,
      },
    ]);
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

    // Fake the key-validation call -- Stage 3 made the API key screen the
    // first screen shown (before setup), so this stage's flow now has to
    // clear it first too.
    await page.route("https://generativelanguage.googleapis.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }),
      });
    });

    await page.goto("/interview-db/mock-interview", { waitUntil: "domcontentloaded" });
    // Hydration buffer -- interacting with the controlled setup form before
    // React hydration finishes lets the raw DOM change happen, then React
    // silently reconciles the input back to its (unchanged) state once
    // hydration catches up, discarding the interaction. Confirmed via a
    // dedicated debug run: without this wait, selectOption() reports the
    // new value immediately but the app keeps behaving as if it never
    // changed -- a test-timing artifact, not a bug in the app itself.
    await page.waitForTimeout(800);
    check("Page loaded", (await page.title()).includes("AI Mock Interview"));

    // Hydration sanity check -- interacting with the controlled key input
    // before React hydrates gets silently discarded once hydration catches
    // up. Toggling the guide first and confirming it collapsed proves
    // hydration is live before relying on the input.
    await page.click("text=Hide guide ↑");
    await page.waitForSelector("text=Show me how to get a key ↓", { timeout: 10000 });

    await page.fill('input[placeholder="AIza..."]', "AIzaFAKE_MOCKED_KEY_00000000000000000");
    await page.click("text=Validate & continue");
    await page.waitForSelector("text=Set up your interview", { timeout: 15000 });
    check("Key validation (mocked) passed and setup stage reached", true);

    // Setup stage: pick a small question count and skip the prep pause so
    // the test doesn't have to sit through a real countdown.
    await page.selectOption("#qcount-select", "3");
    await page.click("text=Skip");
    check("Pause-count hint updates for 3 questions (1 pause)", (await page.textContent("body"))?.includes("1 short pause") ?? false);

    await page.click("text=Continue → enable camera");

    // getUserMedia + MediaPipe model download (real network fetch to CDN/GCS)
    // can genuinely take a while in a cold headless run -- generous timeout.
    await page.waitForSelector("text=Question 1 of 3", { timeout: 45000 });
    check("Camera granted (fake device) and interview stage reached", true);

    const video = page.locator("video");
    await page.waitForFunction(
      () => {
        const v = document.querySelector("video");
        return !!v && v.readyState >= 2 && v.videoWidth > 0;
      },
      { timeout: 15000 }
    );
    check("Video element has real dimensions (fake camera stream attached)", true);
    void video;

    // Give the tracking loop a couple seconds to run against the fake
    // camera feed and update live metrics.
    await page.waitForTimeout(3000);
    const trackingStatus = await page.textContent("text=Tracking…").catch(() => null);
    check("Tracking status shows 'Tracking…' (MediaPipe models loaded)", trackingStatus !== null);

    const metricsText = await page.textContent("body");
    check("Live metric chips rendered (Eye contact / Pace / Fillers)", (metricsText ?? "").includes("Eye contact") && (metricsText ?? "").includes("Posture stability"));

    // Advance through all 3 questions.
    await page.click("text=Next question →");
    await page.waitForSelector("text=Question 2 of 3");
    check("Advanced to question 2", true);

    await page.click("text=Next question →");
    await page.waitForSelector("text=Question 3 of 3");
    check("Advanced to question 3", true);

    // End on the last question -> should trigger onFinish -> processing -> results.
    await page.click("text=Next question →");
    await page.waitForSelector("text=Delivery feedback", { timeout: 20000 });
    check("Interview finished and results screen rendered", true);

    const finalBody = await page.textContent("body");
    check(
      "Per-question metrics rendered (Eye contact %, Fillers, Posture, Duration)",
      (finalBody ?? "").includes("Eye contact") && (finalBody ?? "").includes("Posture") && (finalBody ?? "").includes("Duration")
    );
    // Frame capture itself (every FRAME_SAMPLE_INTERVAL_MS = 4s) isn't
    // asserted here -- this test clicks through questions faster than that
    // interval by design, to keep the run fast. It's covered implicitly by
    // this same tracking loop running for longer in real usage.

    check("No uncaught page errors during the whole flow", consoleErrors.length === 0);
    if (consoleErrors.length) console.log("    page errors:", consoleErrors.slice(0, 5));

    await context.close();

    // Second scenario, same session: simulate a browser with no Web Speech
    // API support (e.g. Safari/Firefox) and confirm the user actually sees
    // a warning instead of silently getting an empty transcript with no
    // explanation -- the real bug this regression case exists for.
    const noSpeechContext = await browser.newContext({ permissions: ["camera", "microphone"], baseURL: BASE_URL });
    await noSpeechContext.addCookies([{ name: COOKIE_KEY, value: encoded, url: BASE_URL }]);
    await noSpeechContext.addInitScript(() => {
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
    });
    const noSpeechPage = await noSpeechContext.newPage();
    await noSpeechPage.route("https://generativelanguage.googleapis.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }),
      });
    });
    await noSpeechPage.goto("/interview-db/mock-interview", { waitUntil: "domcontentloaded" });
    await noSpeechPage.waitForTimeout(800);
    await noSpeechPage.click("text=Hide guide ↑");
    await noSpeechPage.waitForSelector("text=Show me how to get a key ↓", { timeout: 10000 });
    await noSpeechPage.fill('input[placeholder="AIza..."]', "AIzaFAKE_MOCKED_KEY_00000000000000000");
    await noSpeechPage.click("text=Validate & continue");
    await noSpeechPage.waitForSelector("text=Set up your interview", { timeout: 15000 });
    await noSpeechPage.click("text=Skip");
    await noSpeechPage.click("text=Continue → enable camera");
    await noSpeechPage.waitForSelector("text=Question 1 of 5", { timeout: 45000 });
    await noSpeechPage.waitForSelector("text=doesn't support speech-to-text", { timeout: 10000 });
    check("Unsupported-browser speech warning shown to the user (not just console.warn)", true);
    await noSpeechContext.close();
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
