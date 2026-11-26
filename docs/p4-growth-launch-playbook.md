# P4 — growth and discovery launch playbook
Updated 26 November 2026.

## Positioning
KMate is an independent Global Korea Scholarship preparation workspace, not an official scholarship portal. Lead with a practical applicant question rather than vague community claims. Never imply official endorsement, current eligibility, guaranteed selection, or that unpublished GKS-G 2027 rules are known.

## Launch assets (prepared, not posted)
- Graduate pre-cycle preparation: https://kmate.vercel.app/gks-guides/gks-g-2027-preparation
- Undergraduate selection next steps: https://kmate.vercel.app/gks-guides/gks-u-2027-next-steps
- Documents and apostille checklist: https://kmate.vercel.app/gks-guides/gks-document-checklist
- University/department verification: https://kmate.vercel.app/gks-guides/gks-university-requirements
These are planned production URLs. Do not circulate them before the release gate.

## P4.1 — SEO
Five public paths: guide index and four original, source-linked guides. Canonical URLs, unique descriptions, sitemap entries, homepage links, precise public-route allowlist and guest tool deep links. Exclude new private tracker/matching routes from robots crawl. No keyword stuffing or speculative scholarship rules.

After deployment, inspect each URL in an anonymous browser and verify HTTP 200, canonical, title, description, sitemap inclusion, actual guide content and guest redirect. Check that unknown slugs and private routes are not exposed. Use Google Search Console to verify the property and submit https://kmate.vercel.app/sitemap.xml. No Search Console account access or indexing submission has been verified. A sitemap is not a ranking guarantee.
Reference: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap

## P4.2 — Community launch
First candidate: https://www.reddit.com/r/GKSScholarship/. Rules page could not be verified by the available web fetch. Read current rules, seek moderator approval if needed, and do not post until permitted. Other Facebook, Discord and YouTube communities must be individually verified before outreach. No invented group sizes or accounts.

Moderator message (draft):
Hi mods, I built KMate, an independent GKS preparation workspace. I made a public graduate preparation checklist with links to official notices, and would like to share it for feedback. Is a single disclosed resource post allowed here? Happy to follow your preferred format or keep it to a resource thread.

Reddit post (draft; only after live verification and permission):
Title: Preparing for GKS-G 2027? I built a checklist for things we can do before the official guidelines arrive
Body: The general 2027 graduate notice was not located when I checked on November 26, so I am not treating the 2026 forms or deadlines as current. Things worth preparing now: ask for academic records, speak to potential referees, shortlist actual departments, check language policies and plan your statement using real examples. Confirm the official instructions when released. I built KMate to keep these tasks and sources in one place. The guide is readable without an account, and the tools have a read-only guest preview: https://kmate.vercel.app/gks-guides/gks-g-2027-preparation . I am the builder, and this is not an official NIIED service. What part of preparation is still confusing or missing?

Answer specific applicant questions directly; link to KMate only if helpful and allowed. Never automate repeated comments, DMs, fake testimonials or engagement. No promotion has been posted.

## P4.3 — First 14 days (proposed)
Days 1–2: verify release and public guide URLs; collect baseline traffic and signup counts if available.
Days 3–5: request moderator permission, share one relevant guide if approved, invite feedback.
Days 6–10: make useful responses to relevant questions and correct genuine guide issues.
Days 11–14: review anonymous aggregate acquisition metrics and voluntary feedback, then prioritise improvements.
Track organic impressions/clicks, guide visits, guest tool entries, signups and returning users only if appropriate instrumentation already exists or is approved. Do not collect applicant identity, essay drafts or selection stages for marketing. No analytics integration or metric baseline is claimed in this PR.
Initial learning goal: obtain feedback from 10 real applicants; target, not achieved count.

## Release gate
P3 PR #23 remains prerequisite. Its first combined CI failed on render purity; the stage matching page was corrected to rely on DB-enforced expiry. Recheck both CI runs. P3.7 stays disabled until the separate database/security gate is satisfied. Browser checks, production deployment, Search Console and community posting remain unexecuted.
