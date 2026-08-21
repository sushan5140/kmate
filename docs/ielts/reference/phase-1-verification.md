# Phase 1 — Verification

Audit performed 2026-08-21, Microsoft Edge 151, authenticated free-tier account,
`ielts.cathoven.com`. Nothing was purchased, modified, or submitted.

---

## Coverage table

| Area | Inspected | Representative screenshots | Documentation complete |
|---|---|---|---|
| Authenticated dashboard | ✅ | `dashboard-desktop.png` | ✅ `dashboard.md` |
| Academic Reading library | ✅ 29 cards enumerated with slugs + qids | `reading-library.png`, `reading-library-mobile-390.png` | ✅ `academic-reading.md` |
| Academic Reading runner | ✅ full test opened, Parts 1–3, answered, reloaded, submit dialog captured & cancelled | `academic-reading-runner-part1.png`, `-part2.png`, `-tablet-768.png`, `-mobile-390.png`, `reading-submit-confirm.png` | ✅ `academic-reading.md` |
| General Reading library | ✅ same library, `General` filter confirmed | shared with above | ✅ `general-reading.md` |
| General Reading runner | ✅ GT Test 1 opened, all 3 sections' structure extracted | `general-reading-runner-section1.png` | ✅ `general-reading.md` |
| Listening library | ✅ 18 cards enumerated with qids | *(no dedicated shot; structure captured in metadata)* | ✅ `listening.md` |
| Listening runner | ✅ opened, audio played (muted) & paused, controls inventoried | `listening-runner-part1.png`, `listening-runner-mobile-390.png` | ✅ `listening.md` |
| Mock Tests | ✅ determined to be a **mode filter**, not an area; Writing library used to confirm the pattern | *(covered by library shots)* | ✅ `mock-tests.md` |
| Results / Review | ✅ real completed attempt (band 6.0) opened and fully read | `results-review.png` | ✅ `results-review.md` |
| History / Progress | ✅ both tabs; 10 attempt rows; Progress confirmed Writing/Speaking-only | `reports-history.png` | ✅ `progress-history.md` |
| Responsive states | ✅ measured at 390×844, 768×1024, 1440×900 | 4 responsive shots | ✅ `responsive-behaviour.md` |
| Question types | ✅ full metadata census of all 18 Listening tests + 2 Reading tests | *(tabulated)* | ✅ `question-types.md` |
| UI system / stack | ✅ | — | ✅ `ui-system.md` |
| Account / subscription | ✅ pricing read; no locks found on any test card | — | ✅ `dashboard.md` §, `progress-history.md` §3 |

**Not inspected (deliberate):** Speaking (out of scope), the Writing *runner*, Lessons,
Sample Reports, the Study Plan wizard, and any purchase flow.

---

## Counts

| Metric | Value |
|---|---|
| Distinct routes discovered | **13** (`/ielts/` + register, login, dashboard, reading, reading-test, listening, listening-test, writing, speaking, reports, sample-reports, lessons, pricing, contact-us) |
| API endpoints observed | **5** (+1 WebSocket) |
| Reading tests catalogued | **29** (14 Academic, 15 General Training) |
| Listening tests catalogued | **18** |
| Reading test-card variants observed | **1** (only the attempt-state line and button label differ) |
| Reading question types observed | **9** distinct `ielts_question_type` values (10 rows incl. the single/multi MC split) |
| Listening question types observed | **6** distinct `ielts_question_type` values |
| Question-group layouts (`subsection_type`) | **4** — `regular`, `table`, `grid`, `form` |
| Input controls | **4** — `dropdown`, `multiple_choices`, `multiple_select`, `fill_in_the_blank` |
| Mock modes observed | **1** for Reading and Listening ("Mock Test" = full single-skill paper); **5** for Writing |
| Combined multi-skill mocks | **0** |
| Paid / inaccessible areas | Writing & Speaking AI feedback, study plan, AI tutor (behind Premium). **All 47 Reading + Listening tests were fully accessible on the free account.** |

---

## Defects found in the reference product

Recorded because each is something our implementation must actively avoid.

1. **Attempt state is not reset on starting a new test.** Opening GT Reading Test 1 right
   after an Academic Reading Test 1 attempt retained the previous `examEndsAt` (timer
   continued at 52:06 instead of restarting at 60:00), retained `answers: {6741: "E"}`
   (an Academic question id), and retained `currentPart: 2`.
2. **`?report=` leaks across navigations**, rendering the results view where the runner
   was requested.
3. **Listening has no persistence at all** — no IndexedDB key; a refresh loses every
   answer and restarts the timer.
4. **Answers never reach the server during an attempt** — IndexedDB only, so an attempt is
   bound to one browser.
5. **Correct answers are resolvable client-side**: the test detail endpoint ships full
   passages and Listening transcripts with the test.
6. **Content-tagging error**: a GT "write the letter A–D" matching group is tagged
   `sentence_completion` and rendered as a free-text input with no option set.
7. **`plan_map_diagram_labelling` has no image renderer** — 31 instances exist, zero
   subsections carry an image; the map is described in prose instead.
8. **Null score rendered as `0`** on the dashboard (as `—` on the reports page).
9. **History rows never name the test**, making 29 reading tests indistinguishable in
   history.
10. **Accessibility**: multi-select options are bare `<button>`s with no checkbox
    semantics; navigator chips expose no answered/current state; state is colour-only.
11. **The entire question list is duplicated in the DOM** (desktop + mobile copies).

---

## Open questions carried into Phase 2

1. **Provenance of the Reading library.** The list endpoint omits `description`; only the
   detail endpoint carries it. Two provenance strings are already confirmed:
   - `Academic Reading Test 1` → *"Extracted from 9fen Reading Book 1"*
   - `General Training Reading Test 1` → *"Master IELTS General Training Volume 1 -
     Reading Practice Test 1 (ieltsonlinetests.com)"*
   Phase 2 must fetch `description` for all 29 reading tests (metadata only — passages
   discarded, never written to the repo).
2. **Listening provenance.** 8 of 18 carry `(source: ieltsonlinetests.com)`; the 10
   "Actual IELTS Listening Test N" have an **empty** `description` and are unattributed.
   Their source needs identification, and their reuse status is presumptively unclear.
3. **Titles that name commercial books** — "Prepare for IELTS General Training Volume 1/2",
   "Master IELTS General Training 5/6" — need mapping to real publications and a
   `ReuseStatus` decision. Presumptively `copyrighted-restricted`.
4. **Duplicate detection.** Whether "Mock IELTS Reading Test N" overlaps with
   "Academic Reading Test N" content is unresolved; requires structural comparison
   (section titles, question counts, type sequences) — not passage copying.
5. **Missing numbering.** General Training Reading Test **4** is absent (1,2,3,5,6,7,8);
   "Mock IELTS Reading Test" starts at **2**. Worth recording as a catalogue gap.
6. **Alternative-answer handling** in scoring could not be determined from one attempt;
   case-insensitivity is confirmed.
7. **`mock_test_order`** exists on the test entity but has no visible effect in the UI.

---

## Compliance statement

- No cookies, tokens, credentials, or authentication storage were read, printed, exported,
  or committed.
- No browser profile was copied into the repository; the Edge profile lives in the session
  scratchpad only.
- No audio was downloaded; only visible metadata (duration, filename, section mapping) was
  recorded.
- No passages, transcripts, questions, or answer keys were written to the repository.
- No attempt was submitted; the submit dialog was captured and cancelled.
- Screenshots are internal development references only and are not site assets.
