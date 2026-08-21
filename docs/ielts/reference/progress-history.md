# CathoVen — History & Progress

Screenshot: `screenshots/reports-history.png`

---

## 1. History — `/ielts/reports` (tab: Reports)

Page tabs: **Reports** | Progress | Study Plan.

**Filters:** `Status`, `Tool`, `Feedback Language` (set to `English`).
No date range, no skill filter, no search.

**Table columns:** `Time` · `Task` · `Task Description` · `Status` · `Score` · action.
**Pagination:** `Rows per page 20`, `Page 1 of 1`, with first/prev/next/last controls.

All 10 attempts on this account:

| Time | Task | Description | Status | Score |
|---|---|---|---|---|
| 2026-08-13 12:45:33 | IELTS Reading | No Description | Completed | **6** |
| 2026-08-12 13:21:46 | Listening — Part 1 | No Description | Completed | — |
| 2026-08-12 13:15:58 | Listening — Part 2 | No Description | Completed | — |
| 2026-08-12 13:08:30 | Listening — Part 2 | No Description | Completed | — |
| 2026-08-12 13:04:34 | Listening — Part 1 | No Description | Completed | — |
| 2026-08-08 22:59:06 | Listening — Part 2 | No Description | Completed | — |
| 2026-08-08 22:51:18 | Listening — Part 1 | No Description | Completed | — |
| 2026-08-08 22:43:02 | Listening — Part 2 | No Description | Completed | — |
| 2026-08-08 22:36:10 | Listening — Part 1 | No Description | Completed | — |
| 2026-08-03 07:21:07 | Reading — Part 1 | No Description | Completed | — |

### Observations

- **Full tests vs parts are named differently** — `IELTS Reading` vs `Reading — Part 1` —
  but the *test title* is never shown. You cannot tell **which** reading test row 1 refers
  to. That is a real usability failure: with 29 reading tests, the history is unusable for
  tracking which papers you have done.
- `Task Description` is `No Description` on every row — a dead column.
- Only `Completed` status was observed. **No in-progress or abandoned rows appear**, even
  though an in-progress Reading attempt existed in IndexedDB at the time. History is
  therefore built purely from *submitted* attempts.
- **No resume affordance anywhere.** Resuming happens implicitly by reopening the same
  test (which restores from IndexedDB); nothing in the UI advertises it.
- Score `—` for per-part attempts, but the dashboard shows the same rows as `0`.
- No duration column, no band-estimate column, no module (Academic/General) column.

---

## 2. Progress — `/ielts/reports?tab=progress`

**Reading and Listening do not appear at all.** The Progress tab covers only Writing and
Speaking, via a two-tab switcher.

Contents (Writing tab, this account has no writing data):

| Block | Content |
|---|---|
| Empty state | "No writing data yet — Complete your first writing to start tracking your progress and get personalized insights." + `Start Writing Practice` |
| Score cards | `Mock Test · 0 attempts · Latest — · Avg — · Target 8.5`; `Academic Task 1 · 0 attempts`; `Task 2 · 0 attempts`, each with `Show details` |
| Next step | "Your Next Step to a Higher Band — Complete your first practice to learn the one skill you need to improve for a higher band." |
| Progress over time | Weekly chart, "Shows only the latest score for each day", with `Previous` / `Aug 17 – Aug 23, 2026` / `Next` paging, a Mon–Sun row (each day 😴 when empty), and a 0/3/6/9 band axis. Series: Mock Test, Academic Task 1, Task 2. Rendered with **Recharts** (5 chart nodes). |
| Criteria Performance | "Performance analysis based on official IELTS band descriptors" — Task Achievement, Coherence, Lexical Resource, Grammatical Range and Accuracy; each `Latest — / Avg —` with `Show details`. Tabs for Academic Task 1 / Task 2. |

### Assessment

The analytics **are** computed from real attempts (they correctly show zeros and empty
states rather than fabricated numbers) — that part is honest. But:

- ❌ **No Reading progress.** Despite a completed band-6 reading attempt existing.
- ❌ **No Listening progress.** Despite nine listening attempts existing.
- ❌ No weakest/strongest **question-type** analysis for any skill.
- ❌ No overall predicted band across skills.
- ❌ No streak counter (the 😴 day markers hint at one that was never built out).
- ❌ No bookmarks, saved questions, mistakes list, or vocabulary list anywhere in the
  product — searched for, not found.

So of the systems the brief asks about — history, bookmarks, saved questions, mistakes,
vocabulary, analytics, predicted bands, AI explanations, recommendations,
practice-by-question-type, difficulty filters — CathoVen has **history** and
**Writing/Speaking analytics** and an **AI tutor (Catbot)**, and *none* of the rest.

---

## 3. Account & settings

- No settings or profile route appeared in the navigation. Exam module
  (`IELTS Academic`), exam date and target scores are surfaced read-only on the dashboard
  and edited through the Study Plan checklist step "Complete your exam details".
- `Feedback Language` (English / 中文) is the only user preference exposed, on the Reports
  page; it is also persisted in IndexedDB `settings` store as `feedbackLanguage`.
- The referral system (`Invite friends — Get 1 free mock test`) is the only usage-credit
  mechanism visible. No daily limits or quota meters were shown.
- **Nothing was purchased or modified.**

---

## 4. Requirements for our Phase 11

1. History rows must name **the actual test** (title + module + skill), plus date,
   duration, raw score, estimated band, and status.
2. Show **in-progress and abandoned** attempts, with an explicit **Resume** action.
3. Progress must cover **Reading and Listening** — the skills our product is actually about.
4. Add per-question-type strength/weakness, computed from real attempts only.
5. Never render a null score as `0`.
6. Keep the honest empty states — they are the one thing the reference gets right here.
