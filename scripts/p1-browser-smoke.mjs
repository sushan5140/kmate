import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.BASE_URL || "https://kmate.vercel.app").replace(/\/$/, "");
const output = path.join(process.cwd(), "artifacts", "p1-browser");
await fs.mkdir(output, { recursive: true });

async function waitForP1() {
  // This workflow runs on the main push, while Vercel deploys in parallel.
  // Do not smoke-test the prior production version.
  for (let attempt = 0; attempt < 45; attempt++) {
    const response = await fetch(`${base}/privacy`).catch(() => null);
    if (response?.ok && (await response.text()).includes("Know what you share before you join.")) return;
    await new Promise((resolve) => setTimeout(resolve, 8000));
  }
  throw new Error("New P1 privacy page was not live after checking the deployment window");
}

await waitForP1();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of [320, 390, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
      colorScheme: "light",
    });
    const page = await context.newPage();
    const response = await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
    assert.equal(response?.status(), 200, `Homepage HTTP status for ${width}px`);
    await page.getByRole("heading", { name: /Build your GKS application/i }).waitFor();

    // A fullPage screenshot does not simulate actual scrolling. KMate's
    // decorative Reveal sections enter only after they intersect the
    // viewport, so sweep the page before capturing screenshots. This also
    // verifies that a real user can reach the content below the first fold.
    const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < fullHeight; y += 560) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(90);
    }
    const toolsHeading = page.getByRole("heading", {
      name: /Start with the question you actually need answered/i,
    });
    await toolsHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const toolsOpacity = await toolsHeading.evaluate(
      (node) => Number(getComputedStyle(node.parentElement).opacity)
    );
    assert.ok(toolsOpacity >= 0.95,
      `Public tool section did not become visible when scrolled at ${width}px (opacity ${toolsOpacity})`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);

    const actualOverflow = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth
    );
    assert.ok(actualOverflow <= 4, `Horizontal overflow at ${width}px: ${actualOverflow}px`);
    await page.screenshot({ path: path.join(output, `homepage-${width}.png`), fullPage: true });
    results.push({ viewport: width, homepage: "pass", horizontalOverflow: actualOverflow });
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const guest = await context.newPage();
  await guest.goto(`${base}/guest/start?next=%2Frequirement-checker`, {
    waitUntil: "domcontentloaded", timeout: 60000,
  });
  await guest.waitForURL("**/requirement-checker", { timeout: 45000 });
  await guest.getByRole("button", { name: "More navigation" }).click();
  const dialog = guest.getByRole("dialog", { name: "KMate navigation" });
  await dialog.waitFor({ state: "visible" });
  const loginHref = await dialog.getByRole("link", { name: /Continue with Google/ }).getAttribute("href");
  assert.ok(loginHref, "Sign-in link must exist in guest drawer");
  const loginUrl = new URL(loginHref, base);
  assert.equal(loginUrl.pathname, "/login");
  assert.equal(loginUrl.searchParams.get("next"), "/requirement-checker",
    "Google sign-in must return to the selected guest tool");
  await guest.screenshot({ path: path.join(output, "guest-navigation-390.png"), fullPage: true });

  await guest.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  await guest.getByRole("button", { name: "More navigation" }).click();
  await guest.getByRole("dialog").getByRole("link", { name: "Privacy & data use" }).click();
  await guest.waitForURL("**/privacy");
  await guest.getByRole("heading", { name: "Know what you share before you join." }).waitFor();
  await guest.screenshot({ path: path.join(output, "privacy-390.png"), fullPage: true });

  results.push({ guestTool: "requirement-checker", menuDialog: "pass", escape: "pass", loginReturn: "pass", privacy: "pass" });
  await context.close();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ base, results }, null, 2));
  console.log(JSON.stringify({ status: "pass", base, results }, null, 2));
} finally {
  await browser.close();
}
