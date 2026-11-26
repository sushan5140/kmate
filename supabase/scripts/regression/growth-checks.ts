import assert from "node:assert/strict";
import { GUIDES, PUBLIC_GUIDE_PATHS, guidePath, guestToolHref, SITE_URL } from "../../../lib/marketing/gks-guides";
import { isSafeNext } from "../../../lib/auth/safe-next";

assert.equal(GUIDES.length, 4);
assert.equal(new Set(PUBLIC_GUIDE_PATHS).size, 5);
assert.equal(new Set(GUIDES.map(g => g.title)).size, 4);
assert.equal(new Set(GUIDES.map(g => g.description)).size, 4);
for (const guide of GUIDES) {
  assert.match(guide.slug, /^[a-z0-9-]+$/);
  assert.ok(PUBLIC_GUIDE_PATHS.includes(guidePath(guide.slug)));
  assert.ok(guide.sections.length >= 4 && guide.sources.length > 0);
  assert.ok(guide.sources.every(s => new URL(s.href).hostname.endsWith("studyinkorea.go.kr")));
  assert.ok(isSafeNext(guide.tool.href));
  const guest = new URL(guestToolHref(guide.tool.href), SITE_URL);
  assert.equal(guest.pathname, "/guest/start");
  assert.equal(guest.searchParams.get("next"), guide.tool.href);
}
assert.ok(!PUBLIC_GUIDE_PATHS.includes("/stage-matching"));
assert.ok(!PUBLIC_GUIDE_PATHS.includes("/professor-outreach"));
assert.ok(!PUBLIC_GUIDE_PATHS.includes("/gks-guides/not-a-guide"));
const graduate = GUIDES.find(g => g.slug === "gks-g-2027-preparation");
assert.ok(graduate?.intro.includes("not the general 2027 graduate announcement"));
assert.ok(graduate?.sources.some(s => s.label.includes("historical")));
console.log("P4 guide and guest entry regression checks passed.");
