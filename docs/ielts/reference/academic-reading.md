# CathoVen — Academic Reading

Screenshots: `screenshots/reading-library.png`, `screenshots/academic-reading-runner-part1.png`,
`screenshots/academic-reading-runner-part2.png`, `screenshots/reading-submit-confirm.png`

---

## 1. There is no Academic Reading route

Academic and General Training Reading share **one library at `/ielts/reading`** and one
runner at `/ielts/reading-test`. The only distinction is:

- the `task` field / query param: `ielts_reading_academic` vs `ielts_reading_general`
- an **"All tasks / Academic / General"** dropdown filter on the library

This is the single most important architectural finding for Phases 5–6: **the engine is
module-agnostic and the module is metadata.** Our plan (one engine, module as data)
matches, and is confirmed as viable against real content.

---

## 2. Library

Route `/ielts/reading`. Container `data-cy="reading-test-list"`.

**Controls:**

| Control | Type | Options |
|---|---|---|
| Mode toggle | `role="radio"` group | **"Mock Test"** — the only option for Reading |
| Task filter | `role="combobox"` | All tasks · Academic · General |

There is **no search, no sort, no difficulty filter, no pagination, no infinite scroll**.
All 29 tests render at once in a single flat grid.

**Card anatomy** (`data-cy="reading-test-item-<slug>"`):

```
[teal circular icon]  Academic Reading Test 1
                      ( Full Mock Test )        ← amber pill badge
No attempts yet                     [ ▶ Start ]
──────────────────────────────────────────────
Practice by part:
[ Part 1 ] [ Part 2 ] [ Part 3 ]    ← data-cy="reading-test-part-N-<slug>"
```

- Attempt state renders as either `No attempts yet` or `Score: 6`.
- The action button is `Start` when unattempted, `Retake` when attempted.
- Every card is badged `Full Mock Test`. There are no difficulty labels, no question
  counts, no durations, no completion percentages, no "resume" state.
- **Only one card variant exists.** Attempted vs unattempted differ only in the state
  line and the button label.

**Slugs are stable and human-readable**, e.g. `academic-reading-test-1`,
`prepare-for-ielts-general-training-volume-1-reading-test-2`. Useful for Phase 2 IDs.

### Ordering

Cards are **not** grouped by module — Academic and General interleave
(`Academic 1, General 1, General 2, Academic 2, Academic 3, …`), following the backend's
per-task `order` field with no secondary sort. Visually disorganised.

---

## 3. Runner

Route: `/ielts/reading-test?qid=…&name=…&task=ielts_reading_academic&isCustom=false&isFullTest=true`

Clicking `Start` navigates straight into the test. **There is no pre-test instruction
screen, no "you are about to start a 60-minute test" warning, and no start button — the
timer begins immediately on load.**

### Layout (desktop, 1440×900)

```
┌────────────────────────────────────────────────────────────────────┐
│ ←            🕐 58:39                            [ Finish Test ]   │  56px top bar
├────────────────────────────────────────────────────────────────────┤
│ Part 1 — Read the text and answer questions 1–13                   │  grey strip
├───────────────────────────────┬────────────────────────────────────┤
│ Passage                       │ Questions                          │
│ data-cy="reading-passage-     │                                    │
│           panel"              │                                    │
│ own scrollbar                 │ own scrollbar                      │
│         720px  ←── drag ──→   │  720px                             │
├───────────────────────────────┴────────────────────────────────────┤
│  (Part 1) 1 2 3 4 5 6 7 8 9 10 11 12 13  (Part 2 0 of 13) (Part 3 0 of 14) │
└────────────────────────────────────────────────────────────────────┘
```

- Two `react-resizable-panels` panes, **50/50 by default, user-draggable** via a single
  resize handle. Each pane is `overflow: hidden` with an inner `overflow-y: auto`, so the
  two scroll **independently**. Confirmed: `data-panel-size="50.0"`, width 720px each.
- Panels are *not* collapsible (`data-panel-collapsible` absent).

### Top bar
- `data-cy="reading-back-button"`, `aria-label="Exit test"` — a bare left arrow.
- Centre: clock icon + `MM:SS` countdown. **60:00 for a full test.**
- `data-cy="reading-finish-button"` — "Finish Test", filled purple.

### Part strip
`Part N — Read the text and answer questions X–Y`.

### Bottom navigator
- The **active part expands** into per-question circular chips.
- **Inactive parts collapse** into a pill showing `Part N   <answered> of <total>`.
- Chip states are conveyed by background colour only:
  - `bg-primary` — answered
  - `bg-muted` — unanswered
  - a `ring` outline marks the question nearest the scroll position
- Chips are `<button>` elements with **no `aria-label`, no `aria-current`, and no
  accessible name beyond the bare number** — a screen reader hears "1", "2", "3" with no
  indication of answered state. (Recorded for our Phase 15 pass.)
- At narrow widths the chip row gains `Scroll left` / `Scroll right` buttons and a
  horizontal scrollbar.

### Timer behaviour
- Backed by `examEndsAt` (epoch ms) in IndexedDB — a **deadline**, not a decrement.
- Survives full page reload correctly (verified: 58:0x → reload → 56:50).
- **Does not reset when a different test is started** (see `product-map.md` §5).

### Answer persistence
- Verified: set Q1 = `E`, hard-reloaded the page, answer and navigator state were intact.
- Persistence is **IndexedDB-only**; no network write occurs while answering.
- Consequence: answers are per-browser. Signing in elsewhere loses the attempt. Only one
  in-progress reading attempt can exist at a time.

### Leaving a test
Navigating away fires a native **`beforeunload` confirm dialog** (empty message → browser
default wording). The `Exit test` arrow is the sanctioned route out.

### Submit flow
`Finish Test` opens a Radix `role="alertdialog"`:

> **Submit Reading Test?**
> You have 38 unanswered questions. Are you sure you want to submit?
> `Cancel`  `Submit`

Good: it counts unanswered questions. Missing: no flagged-question count, no per-part
breakdown, no time-remaining reminder.

### Features that do NOT exist
Verified by exhaustive control inventory of the runner DOM:

- ❌ **No flag / mark-for-review.** No flag control anywhere; no third navigator chip state.
- ❌ **No highlighting or annotation.** Selecting passage text produces no toolbar or menu.
- ❌ **No notes / scratchpad.**
- ❌ **No font-size, line-height, or theme control.**
- ❌ **No previous/next question buttons** — navigation is via chips and scrolling only.
- ❌ **No pre-test instructions screen.**
- ❌ **No pause / save-and-exit.**

---

## 4. Test structure — Academic Reading Test 1 (worked example)

`qid QN85de96d1-…`, `task ielts_reading_academic`, 3 sections, **40 answer slots**.
Backend `description`: *"Extracted from 9fen Reading Book 1"*.

| Part | Passage title | Text length | Groups | Q range |
|---|---|---|---|---|
| 1 | William Gilbert and Magnetism | 5,328 ch | 3 | 1–13 |
| 2 | *"Passage 2"* (untitled) | 5,903 ch | 4 | 14–26 |
| 3 | Amateur Naturalists | 6,412 ch | 3 | 27–40 |

Group-by-group:

| Part | Qs | Instruction gist | `ielts_question_type` | Control | Options |
|---|---|---|---|---|---|
| 1 | 1–7 | Choose the correct heading for each paragraph A–G | `matching_headings` | dropdown | A–J (10) |
| 1 | 8–10 | TRUE / FALSE / NOT GIVEN | `identifying_information` | dropdown | 3 |
| 1 | 11–13 | Which **THREE** of the following… | `multiple_choice` | multiple_select | 6, `max_selected_options: 3` |
| 2 | 14–19 | YES / NO / NOT GIVEN | `identifying_writers_views` | dropdown | 3 |
| 2 | 20–21 | Answer the questions, NO MORE THAN TWO WORDS | `short_answer` | fill_in_the_blank | — |
| 2 | 22–25 | Complete the summary, NO MORE THAN THREE WORDS | `summary_note_table_flow_chart_completion` | fill_in_the_blank | — |
| 2 | 26 | Choose the correct letter A, B, C or D | `multiple_choice` | multiple_choices | 4 |
| 3 | 27–33 | Which paragraph contains the following information? A–H | `matching_information` | dropdown | 8 |
| 3 | 34–36 | Complete the sentences, NO MORE THAN TWO WORDS | `sentence_completion` | fill_in_the_blank | — |
| 3 | 37–40 | Choose the correct letter A, B, C or D | `multiple_choice` | multiple_choices | 4 |

**Yes — exactly 3 passages, 40 questions,** matching the real Academic Reading format.

### Renderer notes
- Matching Headings shows the heading list **once, above the questions**, then one
  compact dropdown per paragraph. The dropdown options are bare letters (`A`…`J`), not
  the heading text — so the candidate must map letter → heading by eye. Cramped but
  faithful to the paper answer sheet.
- Completion inputs carry `data-cy="reading-input-<qid>"` for a single-blank question and
  `reading-input-<qid>-<n>` when one question has multiple blanks.
- Multi-answer uses `reading-checkbox-<qid>-<optionIndex>`.
- The whole question list is **rendered twice in the DOM** (a desktop copy and a mobile
  copy), sharing one state store. Duplicate `data-cy` values are the tell.

---

## 5. Where we will differ

| CathoVen | Our platform |
|---|---|
| Timer starts on load, no instructions | Pre-test screen with format, duration, rules, explicit Start |
| Answers in IndexedDB only, never synced | Server-side autosave, resumable on any device |
| One resumable attempt globally | Per-test attempt rows, many concurrent |
| New test inherits previous timer/answers | Attempt is created fresh, server-authoritative |
| No flag/review | Flag state as a first-class navigator state |
| No highlighting | Passage highlighting (a genuine IELTS CD-test affordance) |
| Chips have no accessible name | `aria-label="Question 4, answered"` + `aria-current` |
| Correct answers reachable client-side | Answer keys never leave the server in exam mode |
