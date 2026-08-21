# CathoVen — Question Type Inventory

Built from **observed data**, not from our planned list. Two sources:

1. Full metadata scan of **all 18 Listening tests** via `GET /api/ielts/listening/{qid}`.
2. Detailed inspection of **Academic Reading Test 1** and **General Training Reading
   Test 1** (runner DOM + cached test payload).

Reading counts below are therefore *per-test* samples, not a whole-library census; the
whole-library Reading census is Phase 2 work.

---

## 1. CathoVen's type vocabulary

Two independent fields describe every question:

| Field | Purpose | Observed values |
|---|---|---|
| `ielts_question_type` | The **IELTS taxonomy** name | 9 distinct values (below) |
| `question_type` | The **input control** to render | `dropdown`, `multiple_choices`, `multiple_select`, `fill_in_the_blank` |

Plus a group-level field:

| Field | Purpose | Observed values |
|---|---|---|
| `subsection_type` | The **layout** of the question group | `regular`, `table`, `grid`, `form` |

Only **four controls** cover the entire product. This is the central lesson: a small,
composable control set plus a layout hint is enough to render every IELTS question type.

---

## 2. Reading — types observed

| # | `ielts_question_type` | Standard IELTS name | Control | Options | Seen in |
|---|---|---|---|---|---|
| 1 | `matching_headings` | Matching Headings | `dropdown` | letters A–J | Academic |
| 2 | `identifying_information` | True / False / Not Given | `dropdown` | 3 | Academic, General |
| 3 | `identifying_writers_views` | Yes / No / Not Given | `dropdown` | 3 | Academic |
| 4 | `matching_information` | Matching Information (which paragraph) | `dropdown` | letters A–H | Academic |
| 5 | `matching_features` | Matching Features | `dropdown` | letters A–D | General |
| 6 | `multiple_choice` | Multiple Choice (single) | `multiple_choices` | 3–4 | Academic, General |
| 7 | `multiple_choice` | Multiple Answers (choose N) | `multiple_select` | 6–7, `max_selected_options` = N | Academic |
| 8 | `sentence_completion` | Sentence Completion | `fill_in_the_blank` | — | Academic, General |
| 9 | `short_answer` | Short Answer | `fill_in_the_blank` | — | Academic |
| 10 | `summary_note_table_flow_chart_completion` | Summary / Note / Table / Flow-chart Completion | `fill_in_the_blank` | — | Academic, General |

**Note on #6 vs #7:** CathoVen uses the *same* `ielts_question_type` (`multiple_choice`)
for single- and multi-answer, distinguishing them only by `question_type`
(`multiple_choices` vs `multiple_select`) and `max_selected_options`. Our schema should
make this an explicit discriminator rather than an implicit one.

**Note on #10:** four distinct IELTS question types are **merged into one**. The visual
difference is carried by `subsection_type` (`regular` = summary/notes,
`table`/`grid` = table, `form` = form) rather than by the question type. Our brief lists
them as separate types; we will keep them separate at the schema level and treat
CathoVen's merged value as one-to-many on import.

---

## 3. Listening — full census (all 18 tests)

`ielts_question_type` totals across every question entity in the library:

| `ielts_question_type` | Count | Standard IELTS name |
|---|---:|---|
| `form_note_table_flow_chart_summary_completion` | **374** | Form / Note / Table / Flow-chart / Summary Completion |
| `multiple_choice` | **145** | Multiple Choice + Multiple Answers |
| `sentence_completion` | **69** | Sentence Completion |
| `matching` | **69** | Matching |
| `plan_map_diagram_labelling` | **31** | Plan / Map / Diagram Labelling |
| `short_answer` | **17** | Short Answer |

Group layouts (`subsection_type`) across the same census:

| `subsection_type` | Count |
|---|---:|
| `regular` | 87 |
| `form` | 36 |
| `grid` | 22 |

Controls (`question_type`):

| `question_type` | Count |
|---|---:|
| `fill_in_the_blank` | 469 |
| `multiple_choices` | 133 |
| `dropdown` | 93 |
| `multiple_select` | 10 |

---

## 4. The map/plan/diagram finding

`plan_map_diagram_labelling` exists **31 times** across the Listening library — but:

- **Zero subsections in the entire Listening library carry an `image`.**
- The `subsection.visual` field exists in the schema and is `null` everywhere observed.
- `subsection_type` for these groups is plain `regular`.

So CathoVen has **no map/plan/diagram renderer at all**. Instead, the visual is replaced
by a **prose description of the map embedded in the instruction text**. Real example
(Actual IELTS Listening Test 3, Part 2, Questions 11–15):

> "Listen to the directions and match the places in questions 11-15 to the appropriate
> place among A-E on the map. Campus map layout (from north to south, west column | east
> column): • Student Food Service (contains label A) | Gym (B) — Garden Street —
> • Library (C) | Teaching Building — Parker Street …"

The questions themselves are then ordinary `dropdown` questions with options `A`–`E`.

### Why this matters to us

This is the single largest capability gap in the reference product, and it is exactly the
case our brief singles out: *"Especially inspect map/plan/diagram questions carefully
because their renderer may require a different data model from ordinary matching."*

It does. Our model needs:

```ts
interface DiagramLabelQuestion {
  kind: "map-label" | "plan-label" | "diagram-label";
  image: { src: string; alt: string; width: number; height: number };
  hotspots: { id: string; label: string; x: number; y: number }[]; // % coords
  options: { value: string; label: string }[];
}
```

…with an accessible text alternative (which is, in effect, what CathoVen ships as its
*only* representation).

---

## 5. Coverage against the brief's required list

### Reading

| Required by brief | Observed in CathoVen | Notes |
|---|---|---|
| Multiple Choice | ✅ | `multiple_choices` |
| Multiple Answers | ✅ | `multiple_select` + `max_selected_options` |
| True / False / Not Given | ✅ | `identifying_information` |
| Yes / No / Not Given | ✅ | `identifying_writers_views` |
| Matching Headings | ✅ | `matching_headings` |
| Matching Information | ✅ | `matching_information` |
| Matching Features | ✅ | `matching_features` |
| Matching Sentence Endings | ❌ **not observed** | — |
| Sentence Completion | ✅ | |
| Summary Completion | ✅ | merged type |
| Note Completion | ✅ | merged type |
| Table Completion | ✅ | merged type + `subsection_type: table` |
| Flow-chart Completion | ⚠️ named in the merged type; no instance confirmed | |
| Diagram Label Completion | ❌ **not observed in Reading** | |
| Short Answer | ✅ | |

### Listening

| Required by brief | Observed | Notes |
|---|---|---|
| Multiple Choice | ✅ | |
| Multiple Answers | ✅ | 10 `multiple_select` instances |
| Matching | ✅ | 69 |
| Map Labelling | ⚠️ **type present, no image renderer** | 31 combined with plan/diagram |
| Plan Labelling | ⚠️ same merged type | |
| Diagram Labelling | ⚠️ same merged type | |
| Form Completion | ✅ | `subsection_type: form` |
| Note Completion | ✅ | merged type |
| Table Completion | ✅ | `subsection_type: grid` |
| Flow-chart Completion | ⚠️ named in merged type; no instance confirmed | |
| Summary Completion | ✅ | merged type |
| Sentence Completion | ✅ | 69 |
| Short Answer | ✅ | 17 |

**Not invented:** Matching Sentence Endings and Reading Diagram Labelling were **not
seen**. We will still implement them (the brief requires them), but this document does
not claim CathoVen supports them.

---

## 6. Answer data shapes observed

| Control | Stored value | Example |
|---|---|---|
| `dropdown` | single string (a letter or a fixed token) | `"E"`, `"TRUE"`, `"NOT GIVEN"` |
| `multiple_choices` | single string (letter) | `"C"` |
| `multiple_select` | set of option indices, capped by `max_selected_options` | `["A","C","F"]` |
| `fill_in_the_blank` | free text, one value per blank | `"Yuri Larin"` |

Answers are stored in a **flat map keyed by numeric question id**:
`answers: { 6741: "E" }`. For a question with multiple blanks the DOM keys the inputs
`reading-input-<qid>-<blankIndex>`, so the stored value is per-blank.

The report renders `<user answer> : <correct answer>`, and correct answers are plain
strings (`"depersonalised labor"`, `"Colour-coding"`) — implying **case-insensitive,
whitespace-normalised string comparison**, with capitalisation differences tolerated
(`colour-coding` vs `Colour-coding` was marked **correct**).

---

## 7. Keyboard behaviour observed

- Dropdowns are Radix `role="combobox"` → arrow keys + type-ahead + Enter/Escape work,
  and options are `role="option"` with `data-state`. **Good.**
- Completion inputs are ordinary `<input type="text">` — natural tab order. **Good.**
- Multi-answer uses `<button>` elements with `data-cy="reading-checkbox-…"`, **not**
  `<input type="checkbox">` and with no `role="checkbox"` or `aria-checked` observed.
  **Poor** — screen readers cannot announce selected state.
- Navigator chips are `<button>`s whose accessible name is just the number, with no
  answered/current state exposed. **Poor.**

These two weaknesses are logged for our Phase 15 accessibility pass.
