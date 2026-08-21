# CathoVen — General Training Reading

Screenshot: `screenshots/general-reading-runner-section1.png`

Read `academic-reading.md` first — everything there applies unless contradicted below.

---

## 1. How General Training is reached

There is **no General Training area**. It is the same library and the same runner:

- Library filter `role="combobox"` → **General**
- Query param `task=ielts_reading_general`
- Runner route identical: `/ielts/reading-test?qid=…&task=ielts_reading_general&isFullTest=true`

---

## 2. UI differences from Academic

**There are none.**

This was checked deliberately rather than assumed. Identical in both modules:

| Aspect | Academic | General |
|---|---|---|
| Route | `/ielts/reading-test` | same |
| Split pane, 50/50, draggable | ✅ | ✅ |
| Top bar (back / timer / Finish Test) | ✅ | ✅ |
| Timer duration | 60:00 | 60:00 |
| Part strip wording | `Part N — Read the text and answer questions X–Y` | identical |
| Bottom navigator (chips + `X of Y` pills) | ✅ | ✅ |
| Labels used | **"Part 1/2/3"** | **"Part 1/2/3"** — *not* "Section" |
| `data-cy` prefixes | `reading-*` | `reading-*` |
| Persistence | `reading-test-storage` | same single slot |
| Submit dialog | "Submit Reading Test?" | identical |
| Flag / highlight | absent | absent |

**CathoVen calls them "Parts" in both modules**, whereas real IELTS General Training uses
"Sections". Our implementation should use module-appropriate vocabulary
(Academic → Passage, General → Section).

---

## 3. Structural differences (content, not UI)

### The important one: GT sections are still ONE text each

Real IELTS GT Section 1 contains **two or more short texts** (notices, adverts,
timetables); Section 2 contains two work/training texts; Section 3 is one long text.

CathoVen models every GT section as **a single `section.text` blob**, exactly like
Academic. The "multiple short texts" are just headings *inside* that one blob —
`COURSE A`, `COURSE B`, `COURSE C`, `COURSE D`, or advert blocks `A`–`D`.

Consequence in the UI: the left pane is one continuously-scrolling document, and a
question like *"For which advertisement are the following statements true?"* requires the
candidate to scroll and hold four adverts in their head with no visual separation beyond
a bold heading.

> **Our Phase 6 decision:** model a section as owning **N source texts**, each with its
> own label and its own scroll anchor, and render them as distinct cards in the passage
> pane. This is the one place where our data model must be genuinely richer than the
> reference, and it is why Phase 6 is not simply "reuse Academic".

### Worked example — General Training Reading Test 1

`qid QNb09c0d9a-…`, 3 sections, 40 answer slots.
Backend `description`:
*"Master IELTS General Training Volume 1 - Reading Practice Test 1 (ieltsonlinetests.com)"*

| Part | Section title | Text length | Groups | Answer slots |
|---|---|---|---|---|
| 1 | Reading Passage 1 | 5,404 ch | 3 | 13 (1–13) |
| 2 | Reading Passage 2 | 5,156 ch | 3 | 14 (14–27) |
| 3 | Reading Passage 3 | 3,794 ch | 2 | 13 (28–40) |

Section titles are generic placeholders (`Reading Passage 1/2/3`) rather than real
titles — unlike Academic, where two of three passages had real titles.

Group-by-group:

| Part | Instruction gist | `ielts_question_type` | `subsection_type` | Control |
|---|---|---|---|---|
| 1 | For which advertisement are the following statements True? Letter **A–D** | `sentence_completion` ⚠️ | regular | fill_in_the_blank |
| 1 | Choose the appropriate letter A, B or C | `multiple_choice` | regular | multiple_choices |
| 1 | Answer the questions, NO MORE THAN TWO WORDS AND/OR A NUMBER | `sentence_completion` | regular | fill_in_the_blank |
| 2 | Complete the table, NO MORE THAN THREE WORDS AND/OR A NUMBER | `summary_note_table_flow_chart_completion` | **table** | fill_in_the_blank |
| 2 | Match each student need with the appropriate course A, B, C or D | `matching_features` | regular | dropdown |
| 2 | Complete the following sentences, NO MORE THAN TWO WORDS | `sentence_completion` | regular | fill_in_the_blank |
| 3 | TRUE / FALSE / NOT GIVEN | `identifying_information` | regular | dropdown |
| 3 | Complete the table, NO MORE THAN TWO WORDS | `summary_note_table_flow_chart_completion` | **table** | fill_in_the_blank |

⚠️ **Metadata defect in the reference data.** The first group is an A–D *matching* task
but is tagged `sentence_completion` with a free-text input. A candidate is asked to
"write the appropriate letter A–D" into a text box that will accept anything. This is a
content-tagging error on CathoVen's side, and it is exactly the class of error our
Phase 12 import validator must reject: *the instruction says "write the letter A–D" but
the question exposes no option set*.

### Types unique to GT (not seen in the Academic test audited)
- `matching_features`
- `subsection_type: "table"`

### Types seen in Academic but not in this GT test
- `matching_headings`
- `matching_information`
- `identifying_writers_views` (YES/NO/NOT GIVEN)
- `short_answer`

(Both lists are per-test, not per-module — see `question-types.md` for the full inventory.)

---

## 4. Renderer detail: `subsection_type: "table"`

Table Completion renders as a genuine `<table>` with header row and inline numbered
inputs. From `general-reading-runner-section1.png` (Questions 14–17):

```
COURSE │ Course Duration │ Previous Courses Required │ Teaching Method
   A   │ 3 hours         │ (14)[      ]              │ lecture
   B   │ 3 hours         │ none                      │ lecture and (15)[      ]
   C   │ 2 days          │ (16)[      ]              │ workshops and small group discussions
   D   │ (17)[      ]    │ none                      │ workshops
```

The question number badge sits immediately left of its input, and inputs can appear
**mid-sentence inside a cell** (row B). This is driven by `grid_headers` / `grid_cells`
on the subsection. Our `TableCompletion` renderer needs the same capability: a cell is a
sequence of text runs and blank slots, not a single value.

**Matching Features** (Questions 18–22) renders the dropdown **to the left** of the
statement, inline with the wrapped text — compact and readable.

---

## 5. Summary of GT-specific requirements for our build

1. Section model must support **N labelled source texts per section**.
2. Vocabulary switches to "Section" for General Training.
3. Table renderer must support multiple blanks per cell and blanks mid-sentence.
4. Import validation must catch instruction/type mismatches like the A–D case above.
5. Everything else can be shared with Academic — confirmed against real content.
