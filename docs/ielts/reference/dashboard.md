# CathoVen — Authenticated Dashboard

Route: `/ielts/dashboard` (also the redirect target for `/` when signed in).
Screenshot: `screenshots/dashboard-desktop.png`

---

## Global chrome

**Top navigation bar** (single row, always visible):

`CATHOVEN IELTS` (logo → /ielts/dashboard) · Home · My Reports · Writing · Speaking ·
Listening · Reading · Sample Reports · Lessons · Pricing · Support · 🌐 中文 ·
**Invite friends — Get 1 free mock test** · Join IELTS Community

There is also a **collapsible left sidebar** carrying the same ten destinations
(`group-[[data-collapsed=true]]` classes; collapses to icon-only). On small screens the
sidebar is replaced by a `sm:hidden` section-title button.

Notably the primary nav is **skill-first** (Writing / Speaking / Listening / Reading),
not module-first. Academic vs General never appears in navigation.

---

## Page-level tabs

`Dashboard` heading, then: **Home** | **Reports** | **Progress** | **Study Plan**.
Reports/Progress/Study Plan are the same three tabs surfaced at `/ielts/reports`.

---

## Widgets on Home (in order)

### 1. Exam context strip
- `IELTS Academic` — the account's exam module, set once at profile level.
- `Aug 23, 2026 (2 days left)` — target exam date with a live countdown.
- `Target Scores — Overall: 8.5` (sub-scores shown as `—`, unset).

> **Design consequence:** Academic vs General is a **user profile setting** in CathoVen,
> yet the Reading library still shows both and filters by dropdown. The two ideas are not
> wired together — an Academic user sees General tests in their library by default.

### 2. Catbot (AI assistant)
"Hey, I'm Catbot! ✨ I'm here to make IELTS prep fun and effective for you."
Three actions: **Ask** · **Learn** · **Support**.

### 3. Study Plan checklist
"Complete the steps below to get your plan":
- Set daily study time
- Complete your exam details
- Speaking Level Test
- Writing Level Test
- Generate my study plan

A gated onboarding funnel — the plan is not generated until all steps are done.

### 4. Start Practice
Four cards, one per skill:

| Card | Subtitle | CTA |
|---|---|---|
| Writing Practice | Practice Task 1 & Task 2 | Start Writing |
| Reading Practice | Practice Part 1, Part 2, Part 3 | Start Reading |
| Listening Practice | Practice Part 1, Part 2, Part 3, Part 4 | Start Listening |
| Speaking Practice | Practice Part 1, Part 2, Part 3 | Start Speaking |

### 5. Lessons
`0/3 completed`, "View all →" (`/ielts/lessons`). Items observed:
Speaking Test Introduction · General Task 1 Exam Format · Task 2 Exam Format.

### 6. Recent Activity
"Your latest writing and speaking reports" — though it in fact lists Reading and
Listening attempts too. Table columns: **Time · Task · Task Description · Status · Score**,
with a `View Report` action per row. Three most recent rows shown, then
"View all in My Reports".

Rows on this account:

| Time | Task | Status | Score |
|---|---|---|---|
| 2026-08-13 12:45:33 | IELTS Reading | Completed | 6 |
| 2026-08-12 13:21:46 | Listening — Part 1 | Completed | 0 |
| 2026-08-12 13:15:58 | Listening — Part 2 | Completed | 0 |

> Note the inconsistency: the dashboard renders per-part Listening scores as `0`, while
> `/ielts/reports` renders the same rows as `—`. Per-part practice attempts do not
> produce a band; one of the two surfaces formats the null wrongly.

### 7. Progress
Tabs **Writing** | **Speaking** only. Shows *"No writing data yet."* with a
`Start Writing Practice` CTA and `View details in My Progress`.
**Reading and Listening are absent from progress entirely.**

### 8. Footer
`© 2026 Cathoven AI` · Terms of Service · Privacy Policy · Contact Us.

---

## Subscription / paywall state

This account is **free tier**. Observations:

- No card in the Reading (29) or Listening (18) libraries showed a lock, blur, crown, or
  upsell badge. All were startable.
- The paywall is concentrated on **Writing/Speaking AI feedback, the study plan, and the
  AI tutor** — see `/ielts/pricing`.
- Persistent upsell surfaces: the `Invite friends — Get 1 free mock test` referral button
  in the top bar, and the `Pricing` nav item.
- No daily-limit counter or usage meter was visible anywhere.

---

## Search / filtering

There is **no global search** anywhere in the product. Filtering exists only inside each
library (see `academic-reading.md` §2).

---

## What we should take, and what we should not

**Take**
- Skill-first practice cards with explicit part counts.
- Recent-activity table with a direct link to the report.
- Exam-date countdown as a motivating anchor.

**Avoid**
- A progress area that silently covers only two of four skills.
- Deriving "Recent Activity" copy from Writing/Speaking while showing all skills.
- Formatting a null score as `0` (reads as a real, terrible score).
