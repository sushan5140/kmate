# CathoVen — UI System

What the reference product is built from, and which of its choices are worth keeping.

---

## 1. Stack (inferred from live DOM)

| Layer | Evidence | Conclusion |
|---|---|---|
| Framework | `self.__next_f.push`, `$RC("B:0","S:0")`, `/_next/static/chunks/*`, `NEXT-ROUTE-ANNOUNCER` | **Next.js App Router**, React streaming SSR |
| Primitives | `data-radix-collection-item`, `data-state`, `role="combobox"`, `role="radio"`, `role="alertdialog"`, `aria-controls="radix-_r_10_"` | **Radix UI** |
| Styling | `ring-offset-background`, `text-muted-foreground`, `bg-primary`, `border-input`, `bg-[hsl(var(--primary))]` | **Tailwind + shadcn/ui**, HSL CSS-variable theming |
| Split pane | `data-panel-group`, `data-panel`, `data-panel-size`, `data-panel-collapsible`, `data-collapsed` | **react-resizable-panels** |
| Charts | `.recharts-wrapper` | **Recharts** |
| E2E testing | `data-cy` on every meaningful control | **Cypress** |
| Analytics | PostHog (`experiments.cathoven.com`), Datadog RUM + Session Replay, Facebook Pixel, Cookiebot, Cloudflare RUM | heavy instrumentation |

Note our own stack is close enough that most patterns transfer directly: we are also
Next.js App Router + Tailwind, though with hand-rolled primitives rather than Radix/shadcn
(see `../architecture-baseline.md` §6).

---

## 2. Visual language

### Colour
- **Primary: purple** (`bg-[hsl(var(--primary))]`), used for the Finish Test button, band
  score, question-number badges, active pills, and answered navigator chips.
- Canvas is a very light lavender-white; surfaces are white cards.
- Semantic: green ✓ correct, red ✗ incorrect.
- Accent chips: amber pill `Full Mock Test` (`bg-[#FEF7CD]` / `text-[#945800]`);
  teal gradient avatar circle on library cards (`from-teal-500 to-teal-600`).
- Muted text `#7e8299` for attempt state.

### Type
- One sans family throughout, moderate weights. Passage body is comfortable (~15–16px,
  generous leading) — **the reading surface is genuinely well set**, the strongest part of
  the visual design.
- Question instructions mix colour and weight to encode meaning: the constraint phrase
  (`NO MORE THAN TWO WORDS AND/OR NUMBERS`) is bolded and darker, paragraph letters
  (`A-G`) bolded, the rest in muted text. This is effective and worth copying.
- `Questions 14–19` group headers in primary purple, semibold.

### Shape & depth
- Cards: rounded, hairline border, very light shadow.
- Buttons: `rounded-md` (not pills) for actions; `rounded-full` for the part pills and
  question chips.
- Restrained overall — no gradients beyond the small avatar circles, no glassmorphism, no
  neon. **This is the right register for an exam product** and matches the calm, low-chroma
  direction already in KMate's own tokens.

---

## 3. Component patterns worth adopting

| Pattern | Where | Why |
|---|---|---|
| **Numbered badge + inline control** | every question | The question number as a filled circle immediately left of its input keeps number↔answer binding unambiguous, including inside table cells |
| **Active part expands, others collapse to `X of Y`** | bottom navigator | Shows local detail and global progress in one 40px strip |
| **Instruction typography encoding** | question groups | Bold constraint phrases prevent the classic "wrote three words when told two" error |
| **Two-column answer key** | results | Fits 13 questions per part without scrolling |
| **Worked `Example / Answer` row** | listening form completion | Mirrors the real paper and removes ambiguity |
| **Draggable split** | reading runner | Lets the candidate rebalance passage vs questions |
| **`data-cy` on every control** | everywhere | Made this entire audit possible; we should do the same for our Playwright QA |

---

## 4. Anti-patterns to avoid

| Anti-pattern | Where | Problem |
|---|---|---|
| **Whole question list rendered twice** | reading + listening runners | A desktop copy and a mobile copy both in the DOM, sharing state. Duplicate `data-cy`s, duplicate ARIA nodes, doubled DOM cost. Use one tree with responsive CSS. |
| **Multi-answer options as bare `<button>`** | multi-select questions | No `role="checkbox"`, no `aria-checked`; selected state is colour-only |
| **Navigator chips with no accessible name** | both runners | A screen reader hears "1, 2, 3" with no answered/current state |
| **Colour-only state encoding** | navigator (`bg-primary` vs `bg-muted`) | Fails for colour-blind users; needs a shape/icon/label too |
| **Red for the correct answer** | results answer key | Red conventionally marks the error |
| **Timer starts with no instruction screen** | both runners | No chance to prepare; no stated rules |
| **Route mode via query param** | `?report=` on the runner route | Leaked across navigations and rendered the wrong view |
| **Dead columns** | history `Task Description` = "No Description" ×10 | Consumes width, conveys nothing |
| **Null rendered as `0`** | dashboard recent activity | A missing score reads as a catastrophic score |
| **Slow hydration (20–40s cold)** | whole app | Five analytics vendors on a page that must feel exam-grade |

---

## 5. Accessibility observations

Good:
- Radix dropdowns are proper `role="combobox"` + `role="option"` with keyboard support.
- Completion inputs are native `<input type="text">` with natural tab order.
- Submit confirmation is a real `role="alertdialog"`.
- `aria-label="Exit test"`, `"Play audio"` / `"Pause audio"`, `"Scroll left"` / `"Scroll right"`
  are present on icon-only buttons.

Poor:
- Multi-select "checkboxes" have no checkbox semantics (see §4).
- Navigator chips have no state in their accessible name.
- No `aria-live` region announcing timer milestones or part changes was observed.
- Answered/unanswered conveyed by background colour alone.
- The duplicated DOM means assistive tech may encounter every question twice.

These feed directly into our Phase 15 checklist.

---

## 6. Mapping to KMate's existing tokens

Our design tokens (`app/globals.css`) already cover most of what is needed. Phase 14 should
**extend, not replace**:

| Need | Existing KMate token | Action |
|---|---|---|
| Primary action | `--color-primary` `#3e63dd` | reuse (blue, not purple — our own identity) |
| Reading surface | `--color-surface` | add a slightly warmer paper tone for passages |
| Correct | `--color-success` `#2fa36b` | reuse |
| Incorrect | `--color-danger` `#cf4b45` | reuse |
| Flagged | — | **add** (amber; `--color-gold` `#b98a2f` is a good base) |
| Answered / unanswered chip | — | **add**, and pair colour with an icon or ring |
| Exam-mode chrome | — | **add** a quieter, denser variant of the app shell |

Fonts (Manrope + Instrument Serif) are already appropriate; the serif is a good candidate
for passage titles, with Manrope for body.
