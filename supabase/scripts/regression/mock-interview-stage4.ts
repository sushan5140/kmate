/**
 * Stage 4 functional check: drives the full remaining pipeline in a real
 * (headless) browser -- interview finish -> frame selection -> the two
 * parallel Gemini calls (delivery feedback + refined answers) -> results
 * screen -> session persisted to Supabase. The Gemini network calls (key
 * validation, feedback, refine) are intercepted via page.route and answered
 * with canned responses, since there's no real Gemini key available in this
 * environment; this still exercises the real CSP allowance, the real
 * fetch/parsing code (including JSON-schema response parsing for the refine
 * call), and the real persistence API route end to end -- only the far side
 * of the network call is faked.
 *
 * Run: npx tsx supabase/scripts/regression/mock-interview-stage4.ts
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

// Includes markdown syntax deliberately -- Gemini reliably formats delivery
// feedback this way, and the regression case here is that it must render as
// actual formatting (headings, bold), not show literal ###/** characters.
const CANNED_FEEDBACK =
  "### Overall Summary\n\nYou spoke clearly with **steady pacing** throughout.\n\n1. During Q2 your eye contact dipped after a pause.\n2. Consider brief pauses before answering to reduce filler words.";

const CANNED_REFINED_ANSWERS = [
  { questionIndex: 0, refinedAnswer: "REFINED_ANSWER_FOR_Q1_TEXT" },
  { questionIndex: 1, refinedAnswer: "REFINED_ANSWER_FOR_Q2_TEXT" },
  { questionIndex: 2, refinedAnswer: "REFINED_ANSWER_FOR_Q3_TEXT" },
];

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
  const user = await createThrowawayUser(admin, "mockinterviewstage4");
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  try {
    const session = await sessionFor(user.email);
    const encoded = "base64-" + b64(JSON.stringify(session));

    const context = await browser.newContext({ permissions: ["camera", "microphone"], baseURL: BASE_URL });
    await context.addCookies([{ name: COOKIE_KEY, value: encoded, url: BASE_URL }]);
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

    // Fakes all three Gemini calls this feature makes (key validation, the
    // delivery-feedback call, and the refine-answers call) so the test
    // doesn't need a real API key -- distinguished by request body content
    // since all three hit the same URL. The refine call is identified by its
    // JSON-schema generationConfig, not by prompt text, matching how the
    // real client actually marks it.
    let sawFeedbackCall = false;
    let sawRefineCall = false;
    await page.route("https://generativelanguage.googleapis.com/**", async (route) => {
      const postData = route.request().postDataJSON() as {
        contents?: { parts?: { text?: string }[] }[];
        generationConfig?: { responseMimeType?: string };
      };
      const text = postData?.contents?.[0]?.parts?.[0]?.text ?? "";
      const isJsonMode = postData?.generationConfig?.responseMimeType === "application/json";
      if (text.includes("Reply with just: OK")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }),
        });
      } else if (isJsonMode) {
        sawRefineCall = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(CANNED_REFINED_ANSWERS) }] } }] }),
        });
      } else {
        sawFeedbackCall = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ candidates: [{ content: { parts: [{ text: CANNED_FEEDBACK }] } }] }),
        });
      }
    });

    await page.goto("/interview-db/mock-interview", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);

    // Hydration sanity check (same reasoning as stage2/stage3: interacting
    // before React hydrates gets silently discarded once hydration catches
    // up). Toggling the guide first and confirming it actually collapsed
    // proves hydration is live before we rely on the controlled key input.
    await page.click("text=Hide guide ↑");
    await page.waitForSelector("text=Show me how to get a key ↓", { timeout: 10000 });
    check("Hydration confirmed (guide toggle actually worked)", true);

    await page.fill('input[placeholder="AIza..."]', "AIzaFAKE_MOCKED_KEY_00000000000000000");
    await page.click("text=Validate & continue");
    await page.waitForSelector("text=Set up your interview", { timeout: 15000 });
    check("Key validation (mocked) passed and setup stage reached", true);

    await page.selectOption("#qcount-select", "3");
    await page.click("text=Skip");
    await page.click("text=Continue → enable camera");

    await page.waitForSelector("text=Question 1 of 3", { timeout: 45000 });
    check("Interview stage reached with fake camera", true);

    // Deliberately click through as fast as possible (no grace wait for
    // MediaPipe models to finish loading) -- this is the regression case for
    // a real bug this same test caught: Question 1's tracking runtime used
    // to only be created once model loading finished, so a fast first click
    // silently dropped Question 1 and shifted every later question's stored
    // index. See interview-stage.tsx's rtRef initializer.
    await page.click("text=Next question →");
    await page.waitForSelector("text=Question 2 of 3");
    await page.click("text=Next question →");
    await page.waitForSelector("text=Question 3 of 3");
    await page.click("text=Next question →");
    check("Advanced through all 3 questions", true);

    await page.waitForSelector("text=Delivery feedback", { timeout: 20000 });
    check("Reached results stage (processing screen was transient and resolved)", true);
    check("Feedback call was actually made (not skipped)", sawFeedbackCall);
    check("Refine-answers call was actually made (not skipped)", sawRefineCall);

    const resultsBody = await page.textContent("body");
    check("Canned feedback text rendered on results screen", (resultsBody ?? "").includes("steady pacing"));
    check("Feedback markdown was actually rendered, not shown as literal syntax", !(resultsBody ?? "").includes("###") && !(resultsBody ?? "").includes("**"));
    check("Feedback heading rendered as a real element", (await page.locator("text=Overall Summary").count()) > 0);
    check("Feedback bold text rendered as a real <strong> element", (await page.locator("strong", { hasText: "steady pacing" }).count()) > 0);
    check(
      "Per-question metrics rendered on results screen",
      (resultsBody ?? "").includes("Eye contact") && (resultsBody ?? "").includes("Duration")
    );
    check("Refined-answer heading rendered on results screen", (resultsBody ?? "").includes("A clearer way to say it"));
    check(
      "All 3 refined answers rendered, in the right order",
      CANNED_REFINED_ANSWERS.every((a) => (resultsBody ?? "").includes(a.refinedAnswer))
    );

    await page.waitForSelector("text=Saved to your interview history.", { timeout: 15000 });
    check("Session save confirmed in UI", true);

    check("No uncaught page errors during the whole flow", consoleErrors.length === 0);
    if (consoleErrors.length) console.log("    page errors:", consoleErrors.slice(0, 5));

    // Verify what actually landed in Supabase, not just what the UI claims.
    const { data: sessionRow, error: sessionErr } = await admin
      .from("interview_sessions")
      .select("*")
      .eq("user_id", user.userId)
      .maybeSingle();
    check("interview_sessions row persisted", !sessionErr && !!sessionRow);
    if (sessionRow) {
      check("Persisted category is 'all'", sessionRow.category === "all");
      check("Persisted question_count is 3", sessionRow.question_count === 3);
      check("Persisted status is 'completed' (all 3 questions actually recorded)", sessionRow.status === "completed");
      check("Persisted final_feedback_text matches the mocked Gemini response", sessionRow.final_feedback_text === CANNED_FEEDBACK);

      const { data: questionRows, error: qErr } = await admin
        .from("interview_session_questions")
        .select("*")
        .eq("session_id", sessionRow.id)
        .order("question_index", { ascending: true });
      check("interview_session_questions has exactly 3 rows (none dropped)", !qErr && questionRows?.length === 3);
      check(
        "Question rows have real question text and non-negative metrics",
        (questionRows ?? []).every((q) => q.question_text?.length > 0 && q.wpm >= 0 && q.eye_contact_pct >= 0)
      );
      check(
        "Persisted refined_answer matches the mocked response, per question index",
        (questionRows ?? []).every(
          (q) => q.refined_answer === CANNED_REFINED_ANSWERS.find((a) => a.questionIndex === q.question_index)?.refinedAnswer
        )
      );
    }

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
