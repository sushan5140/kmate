# CathoVen — Results & Answer Review

Screenshot: `screenshots/results-review.png`

Documented from a real completed attempt already on the account:
**Academic Reading Test 2**, submitted 2026-08-13 12:45:33, band 6.0.

---

## 1. Route

```
/ielts/reading-test?report=6a7d6f153db2fda097955e6f
```

The **same route as the runner**, switched into report mode by the `report` query param
(a 24-character hex id — MongoDB ObjectId shaped, unlike the `QN<uuid>` test ids).

Only one `data-cy` exists on the whole page: `reading-report-back-button`.

> Defect noted: this `report` param leaked onto a subsequent runner URL during the audit,
> causing the report to render where the test was requested. See `product-map.md` §2.1.

---

## 2. Layout

```
┌────────────────────────────────────────────────────────────────┐
│ ← Back   📄 Reading Analysis   Date: 2026-08-13 12:45:33   [⤴] │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  6.0/9.0            B2                    23/40          │  │
│  │  Overall Band Score CEFR Level        Correct Answers    │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Answer Key                                              │  │
│  │  Part 1: 8/13 correct                                    │  │
│  │   ①  YES : NOT GIVEN ⊗      ⑧  B : B ⊘                  │  │
│  │   ②  YES : YES ⊘            ⑨  D : D ⊘                  │  │
│  │   …two columns…                                          │  │
│  │  Part 2: 8/13 correct                                    │  │
│  │  Part 3: 7/14 correct                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│  [ Part 1 ] [ Part 2 ] [ Part 3 ]   ← passage tabs             │
│  Part 1 Passage — full passage text for reference              │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. What is shown

| Element | Value on this attempt |
|---|---|
| Title | `Reading Analysis` |
| Date | `2026-08-13 12:45:33` |
| **Overall Band Score** | `6.0/9.0` — large, purple |
| **CEFR Level** | `B2` |
| **Correct Answers** | `23/40` |
| Per-part score | `Part 1: 8/13`, `Part 2: 8/13`, `Part 3: 7/14` |
| Per-question | `<user answer> : <correct answer>` + ✓/✗ icon |
| Passage reference | Full passage text, tabbed by part |
| Export | An upload/share glyph, top-right (not exercised) |

### The band label

CathoVen prints **"Overall Band Score"** with no qualifier — presenting an unofficial,
self-computed score as if it were an IELTS band. Our brief forbids this: we must label
ours **"Estimated Band"** and keep the raw→band mapping in swappable configuration.

Adding a **CEFR level** alongside the band is a genuinely nice touch worth adopting
(clearly derived, not claimed as official).

---

## 4. What is NOT shown

Verified absent from the report page:

- ❌ **No question-type breakdown** (nothing like "Matching Headings 4/7")
- ❌ **No time spent** — neither total nor per part
- ❌ **No explanations / rationale** for any answer
- ❌ **No unanswered count** as a distinct category (blank simply reads as wrong)
- ❌ **No accuracy percentage**
- ❌ **No link back to the question in context** — the passage is shown separately from
  the answer key, so you cannot see the question, your answer, and the relevant passage
  sentence together
- ❌ **No retry button** on the report (retake is only from the library card)
- ❌ **No flagged-question review** (flagging does not exist)
- ❌ **No comparison to previous attempts**
- ❌ **No transcript link** for Listening reports

The report is an **answer key, not a review experience.**

---

## 5. Answer-key presentation detail

Each row is `<number> <user answer> : <correct answer> <icon>`.

- Correct rows: both values green, ⊘ check icon.
- Incorrect rows: user answer in dark text, **correct answer in red**, ⊗ cross icon.

Using red for the *correct* answer is a readability problem — red conventionally marks the
error, so the eye lands on the right answer as though it were the mistake.

Real rows from this attempt illustrate the scoring rules:

| # | Row | Reading |
|---|---|---|
| 2 | `YES : YES` ✓ | exact token match |
| 1 | `YES : NOT GIVEN` ✗ | wrong token |
| 38 | `Yuri Larin : Yuri Larin` ✓ | free text, exact |
| 39 | `colour-coding : Colour-coding` ✓ | **case-insensitive** — marked correct |
| 40 | `family : depersonalised labor` ✗ | free text, wrong |

That confirms free-text grading is **case-insensitive** and, on this evidence,
whitespace-normalised. Whether it accepts alternative answers (`colour`/`color`) could not
be determined from a single attempt.

---

## 6. Practice-by-part reports

Per-part attempts also produce a report row, but with **no band**: the history table shows
`—` in the Score column (the dashboard renders the same null as `0`). The report page for
those was not opened, since the full-test report is the more complete artefact.

---

## 7. Requirements this generates for our Phase 10

1. Header stats: **Estimated Band** (labelled), raw score, correct / incorrect /
   **unanswered as a third category**, accuracy %, and **time taken**.
2. **Section breakdown** and **question-type breakdown** — both absent in the reference
   and both explicitly required by our brief.
3. Review mode that shows, per question, in one place: the question, the user's answer,
   the correct answer, status, an explanation when available, and **a link to the source
   text location** (passage paragraph, or transcript timestamp for Listening).
4. Colour semantics: green = correct, red = the user's error, neutral/highlight = the
   correct answer on an incorrect row.
5. Practice attempts may offer **Retry**; exam attempts remain historically intact.
6. A distinct results route, not a query-param mode of the runner route.
