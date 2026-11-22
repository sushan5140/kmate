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

if (failures.length) {
  console.error("\nKMate release audit failed:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("KMate release audit passed: deployment policy, route integrity, launch copy, product hierarchy and catalog verification are guarded.");
