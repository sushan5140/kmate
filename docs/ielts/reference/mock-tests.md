# CathoVen — "Mock Tests"

---

## 1. There is no separate Mock Test area

Searched for a dedicated route or nav entry named Mock Test / Full Test / Simulation /
Exam / Practice Exam. **None exists.** The top nav and sidebar contain only:
Home, My Reports, Writing, Speaking, Listening, Reading, Sample Reports, Lessons,
Pricing, Support.

"Mock Test" in CathoVen is **a mode filter inside each skill library**, not a product area.

---

## 2. What "Mock Test" actually means

Each skill library has a `role="radio"` toggle group of modes:

| Library | Mode options |
|---|---|
| `/ielts/reading` | **Mock Test** *(only option)* |
| `/ielts/listening` | **Mock Test** *(only option)* |
| `/ielts/writing` | **Mock Test** · Academic Task 1 · General Task 1 · Task 2 · Custom Question |

So for Writing, "Mock Test" means *the full two-task writing paper* as opposed to a single
task. By the same logic, for Reading and Listening **"Mock Test" = one complete
single-skill paper** (3 passages / 4 sections, 40 questions), as opposed to the per-part
practice reachable from the card's `Part N` buttons.

Every card in both libraries carries the amber badge `Full Mock Test`, and the runner URL
for Reading carries `isFullTest=true`.

### Therefore

- ✅ A "mock" **is** available for Academic Reading, General Training Reading, and Listening.
- ❌ There is **no combined multi-skill mock** — no single sitting that chains
  Listening → Reading → Writing → Speaking with section transitions and one overall band.
- ❌ There is no Academic-mock vs General-mock *area*; the module is still just the
  library's task filter.

The pricing page advertises **"50+ mock tests"**, which is consistent with counting
single-skill papers: 29 Reading + 18 Listening + the Writing set ≈ 50+.

---

## 3. Mock vs practice — what actually differs

| Aspect | Full Mock Test (`isFullTest=true`) | Practice by part |
|---|---|---|
| Entry | card `Start` / `Retake` button | card `Part N` button |
| Scope | all 3 (Reading) / 4 (Listening) parts | one part |
| Timer | 60:00 Reading, ~30:00 Listening | shorter (per-part) |
| Report score | a band, e.g. `6` | **`—` / no band** |
| Appears in history as | `IELTS Reading` | `Reading — Part 1` |
| Library card state | `Score: 6` | not reflected on the card |

That last row is the meaningful product difference: **only full mock attempts yield a
band score**, and only they update the card's attempt state.

---

## 4. Pre-test experience — there isn't one

For both Reading and Listening, clicking `Start`:

1. navigates straight to the runner,
2. renders the first part,
3. **starts the timer immediately.**

There is no interstitial showing test type, section list, expected duration, rules, a
warning about leaving, or a Start button. This is the largest UX gap versus what our
Phase 8 requires, and versus the real computer-delivered IELTS, which always shows
instructions first.

---

## 5. During the mock

- **Backward navigation is allowed** — any part, any question, at any time, via the
  bottom navigator. No section locking.
- **Autosave:** Reading persists to IndexedDB (local only, never to the server);
  Listening persists nothing at all.
- **Section transitions** are manual; nothing auto-advances and no time is allotted
  between sections.
- **No explanations are shown** during the attempt — correct.
- **Leaving** triggers a native `beforeunload` confirm (Reading).
- **No pause / save-and-exit**, and the deadline keeps running.

---

## 6. End of test

`Finish Test` → Radix `role="alertdialog"`:

> **Submit Reading Test?**
> You have 38 unanswered questions. Are you sure you want to submit?
> `Cancel` · `Submit`

Present: unanswered count. Absent: answered count, flagged count (no flagging exists),
per-part breakdown, remaining time.

**No attempt was submitted during this audit** — the dialog was captured and cancelled, so
no attempt was consumed. Post-submission behaviour is documented in `results-review.md`
from an attempt that already existed on the account (Academic Reading Test 2, band 6).

---

## 7. Do mocks reuse the individual libraries?

Yes — trivially, because they *are* the individual libraries. There is no separate mock
content pool: a "mock" is simply a library test run in full-test mode. The
`mock_test_order` field exists on the test entity (observed values: `null` for
Academic Reading Test 1, `1` for a Listening test), suggesting an intended ordering for
mock presentation, but no distinct mock collection surfaces in the UI.

Detailed cross-referencing of which tests are duplicated across the libraries is
**Phase 2** work, per the brief.

---

## 8. What our Phase 8 must add

1. A real **pre-test screen**: module, skill, section list, duration, rules, explicit Start.
2. **Multi-skill mocks** (Listening → Reading) as a first-class entity, with section
   transitions and a combined estimated band — something the reference lacks entirely.
3. Server-side attempt tracking so a mock survives a refresh and a device change.
4. A submission summary showing **answered / unanswered / flagged** counts.
5. A visible distinction between practice mode and exam mode, rather than a hidden
   `isFullTest` query parameter.
