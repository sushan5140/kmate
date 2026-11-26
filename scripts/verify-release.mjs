import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const readJson = (p) => JSON.parse(read(p));
const exists = (p) => fs.existsSync(path.join(root, p));

const failures = [];
const ok = (condition, message) => {
  if (!condition) failures.push(message);
};

const vercel = readJson("vercel.json");
const deploy = vercel.git?.deploymentEnabled ?? {};
ok(deploy["**"] === false, "Development branches must be disabled in Vercel Git deployments");
ok(deploy.main === true, "main must be allowed to deploy");
ok(deploy.preview === true, "preview must be allowed to deploy");
ok(
  Object.entries(deploy).every(([branch, enabled]) =>
    ["**", "main", "preview"].includes(branch) || enabled === false
  ),
  "No extra branch may be silently enabled for Vercel"
);

ok(exists("app/(info)/about/page.tsx"), "Landing page /about destination must exist");
const landing = read("app/page.tsx");
ok(landing.includes('href="/about"'), "Landing page must link to the About page");
for (const stale of [
  "three university choices",
  "42.3k members",
  "contacts unlock for both",
  "Every question in the bank was reported by someone who sat",
]) {
  ok(!landing.includes(stale), `Launch copy still contains stale/unverified claim: ${stale}`);
}
ok(
  landing.includes("Build your") && landing.includes("GKS application"),
  "Landing hero must reflect application-first positioning"
);

// Public trust: visitors must not mistake fictional marketing previews for
// real applicants or verified interview frequency statistics.
const discoverPreview = read("components/marketing/discover-mockup.tsx");
const interviewPreview = read("components/marketing/interview-mockup.tsx");
const connectPreview = read("components/marketing/connect-mockup.tsx");
const timelinePreview = read("components/marketing/gks-timeline.tsx");
ok(landing.includes('id="explore-tools"') && landing.includes("/guest/start?next="),
  "Landing must expose direct read-only guest tool entry points");
ok(discoverPreview.includes("Fictional applicant profiles"),
  "Marketing applicant examples must be visibly labelled fictional");
ok(interviewPreview.includes("Illustrative preview") &&
   !interviewPreview.includes("asked in 23 interviews") &&
   !interviewPreview.includes("Saved 2s ago"),
  "Marketing interview demo must not imply real counts or live save events");
ok(connectPreview.includes("Private in-app messaging") &&
   !connectPreview.includes("@aigerim_telegram"),
  "Connection example must match the current in-app messaging privacy model");
ok(timelinePreview.includes("grid-cols-1") && timelinePreview.includes("md:grid-cols-5"),
  "GKS timeline must be readable on mobile without horizontal scrolling");
ok(exists("app/robots.ts") && exists("app/sitemap.ts"),
  "Public indexing rules and sitemap must be present");
const proxy = read("proxy.ts");
ok(proxy.includes('"/robots.txt"') && proxy.includes('"/sitemap.xml"') &&
   proxy.includes("PUBLIC_METADATA_PATHS.has(pathname)"),
   "Public metadata routes must bypass the authentication redirect");


// P1 privacy and guest-to-account conversion invariants.
const privacy = read("app/(info)/privacy/page.tsx");
const profileReset = read("app/api/account/delete/route.ts");
const resetUi = read("components/settings/delete-account-button.tsx");
const mobileMenu = read("components/layout/more-menu.tsx");
const sidebar = read("components/layout/sidebar.tsx");
const footer = read("components/layout/footer.tsx");
const loginPage = read("app/login/page.tsx");
const sitemap = read("app/sitemap.ts");

ok(proxy.includes('"/privacy"') && exists("app/(info)/privacy/page.tsx"),
  "Privacy information must be accessible without creating an account");
ok(footer.includes('href="/privacy"') && loginPage.includes('href="/privacy"') && sitemap.includes("/privacy"),
  "Privacy practices must be discoverable from entry points and crawlers");
ok(privacy.includes("does not delete your Google-linked Supabase authentication identity") &&
   privacy.includes("accepted connection") && privacy.includes("Guest preview"),
  "Data practices must describe reset limitations, accepted connections and guest access");
ok(resetUi.includes("Reset my KMate profile") &&
   !resetUi.includes("Yes, delete my account") &&
   resetUi.includes("if (!response.ok)") && resetUi.includes("role=\"alert\""),
  "Account reset UI must not pretend erasure or a successful failed operation");
ok(profileReset.includes('operation: "profile_reset"') &&
   profileReset.includes("if (contactResult.error)") &&
   profileReset.includes("if (draftResult.error)") &&
   profileReset.includes("if (connectionResult.error)"),
  "Profile reset API must check each step and identify reset rather than account deletion");
ok(mobileMenu.includes("useSearchParams") &&
   mobileMenu.includes("buildLoginUrl") &&
   sidebar.includes("buildLoginUrl(pathname)"),
  "Guest sign-in should return to the selected tool rather than discarding the destination");
ok(mobileMenu.includes('aria-modal="true"') &&
   mobileMenu.includes('role="dialog"') &&
   mobileMenu.includes('event.key === "Escape"') &&
   mobileMenu.includes('event.key !== "Tab"'),
  "Mobile navigation needs a labelled, keyboard-operable sheet");
ok(mobileMenu.includes("else setError(") && mobileMenu.includes("Report a problem"),
  "Report failures must be visible, not silently ignored");

const constants = read("lib/constants.ts");
ok(constants.includes("GKS_U_APPLICATION_ROUTES"), "Explicit GKS-U application route type is missing");

const wizard = read("components/onboarding/onboarding-wizard.tsx");
ok(
  wizard.includes("gksUApplicationRoute") &&
    wizard.includes('value: "embassy"') &&
    wizard.includes('value: "university"'),
  "Onboarding must explicitly ask Embassy vs University Track"
);

const picker = read("components/onboarding/university-picker.tsx");
ok(
  picker.includes('route === "university"') &&
    picker.includes('category === "uic_bachelors"') &&
    picker.includes('category === "associate_degree"'),
  "University picker must choose eligibility rows for the explicit route"
);

for (const apiPath of ["app/api/onboarding/complete/route.ts", "app/api/profile/update/route.ts"]) {
  const api = read(apiPath);
  ok(api.includes("GKS_U_APPLICATION_ROUTES"), `${apiPath}: explicit GKS-U route is not validated`);
  ok(api.includes("university_id") && api.includes("row.track !== track"), `${apiPath}: eligibility ownership/track must be checked server-side`);
}

const profileDefaults = read("lib/readiness/profile.ts");
ok(
  profileDefaults.includes("resolveGksUApplicationRoute") &&
    profileDefaults.includes('track = "university"'),
  "Readiness must recover an explicit University Track route from saved eligibility"
);

const home = read("app/home/page.tsx");
ok(
  home.includes("Explore more KMate tools") && home.includes("<details"),
  "Home secondary tools must stay collapsed behind the application dashboard"
);

const readiness = read("app/application-readiness/page.tsx");
for (const anchor of ["application-setup", "application-checklist", "supporting-tools"]) {
  ok(readiness.includes(anchor), `Readiness flow anchor missing: ${anchor}`);
}

// P3.1 graduate pre-cycle preparation must not be mistaken for official 2027 rules.
const graduateHub = read("components/readiness/graduate-preparation-hub.tsx");
ok(readiness.includes('program === "GKS-G"') && readiness.includes("<GraduatePreparationHub") &&
   readiness.includes("getReviewerGuest()") && landing.includes("GKS_G_PREPARATION_PATH"),
  "Graduate preparation must be reachable in read-only guest mode and scoped to GKS-G");
ok(graduateHub.includes("2026 guidelines (historical)") && graduateHub.includes("not official requirements or deadlines") &&
   graduateHub.includes("Guest preview · read-only") && graduateHub.includes("Clear preparation progress"),
  "Graduate preparation must preserve cycle boundaries, guest privacy and a local reset");
 
// P3.4–P3.7 release invariants: private manual worksheets, separate from official rules.
const worksheet = read("components/applications/local-worksheet.tsx");
const cycleWorksheet = read("components/applications/cycle-worksheet.tsx");
const departmentPage = read("app/requirement-checker/page.tsx");
ok(departmentPage.includes("DEPARTMENT_GROUPS") && departmentPage.includes("worksheetAccountId") &&
   readiness.includes("ESSAY_GROUPS") && readiness.includes("PACKET_GROUPS"),
  "All manual preparation worksheets must be wired into existing application tools");
ok(worksheet.includes("Guest preview · read-only") && worksheet.includes("window.localStorage.removeItem(key)") &&
   cycleWorksheet.includes("Intended application cycle") && worksheet.includes("validateWorksheet"),
  "Worksheets require cycle scoping, local reset, guest isolation and validation");
const matchingApi = read("app/api/stage-matching/route.ts");
const matchingPage = read("app/stage-matching/page.tsx");
const matchingSql = read("supabase/staged/p3_7_stage_matching.sql");
ok(matchingApi.includes("getAuthenticatedUser()") && matchingApi.includes('body.consent !== true') &&
   matchingApi.includes('eq("user_id", user.id)') && matchingPage.includes('process.env.KMATE_STAGE_MATCHING_ENABLED === "true"'),
  "Stage matching must require explicit authenticated consent and default to disabled");
ok(matchingSql.includes("enable row level security") && matchingSql.includes("security invoker") &&
   matchingSql.includes("from public, anon, authenticated") && matchingSql.includes("public.blocks") &&
   matchingSql.includes("mine.expires_at > now() and theirs.expires_at > now()"),
  "Staged matching schema must restrict direct access, respect blocks and require mutual active consent");

const sync = read("lib/gks/university-sync.ts");
ok(
  sync.includes("catalogVerified: true") &&
    sync.includes("expectedGksURows") &&
    sync.includes("verifiedGksURows"),
  "University reconciliation must verify the final DB state, not only write it"
);
const health = read("lib/automation/health.ts");
ok(
  health.includes('"university-catalog"') && health.includes("lastStats"),
  "University catalog maintenance must appear in automation health"
);

const readme = read("README.md");
ok(
  readme.includes("application-intelligence") &&
    readme.includes("Community is part of the product"),
  "README positioning must match the application-first product"
);

// P4 public guidance must not open private application routes.
const p4Proxy = read("proxy.ts");
const p4Sitemap = read("app/sitemap.ts");
const p4Robots = read("app/robots.ts");
const p4Article = read("app/(info)/gks-guides/[slug]/page.tsx");
ok(p4Proxy.includes("PUBLIC_GUIDE_PATHS.includes(pathname)") && p4Sitemap.includes("PUBLIC_GUIDE_PATHS.map"),
  "Public guide allowlist and sitemap must use the same source");
ok(p4Robots.includes('"/professor-outreach"') && p4Robots.includes('"/stage-matching"'),
  "New private tool routes must stay out of crawls");
ok(p4Article.includes("alternates: { canonical: url }") && p4Article.includes("guestToolHref(g.tool.href)"),
  "Public guides need unique canonicals and safe guest links");
if (failures.length) {
  console.error("\nKMate release audit failed:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("KMate release audit passed: deployment policy, route integrity, launch copy, product hierarchy and catalog verification are guarded.");
