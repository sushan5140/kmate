# CathoVen — Responsive Behaviour

Measured in the live authenticated product, not inferred from CSS. Viewport changed via
Playwright `setViewportSize`, then layout re-measured from the DOM and screenshotted.

Screenshots: `academic-reading-runner-mobile-390.png`, `academic-reading-runner-tablet-768.png`,
`reading-library-mobile-390.png`, `listening-runner-mobile-390.png`

---

## 1. Viewports tested

| Viewport | Screens checked | Horizontal overflow |
|---|---|---|
| **390 × 844** (mobile) | Reading library, Academic Reading runner, Listening runner | **None** (`scrollWidth 390 === clientWidth 390`) |
| **768 × 1024** (tablet) | Academic Reading runner | **None** (`768 === 768`) |
| **1440 × 900** (desktop) | Dashboard, Reading library, Reading runner, Listening runner, Reports, Results | **None** |

No accidental horizontal scrolling was found at any size — the reference is clean on that
axis.

---

## 2. The split-pane breakpoint

The Reading runner's `react-resizable-panels` split is **on at ≥768px and off below**:

| Viewport | `[data-panel]` measured | Result |
|---|---|---|
| 1440 | two panels, `data-panel-size="50.0"`, **720px each**, visible | side-by-side, draggable |
| 768 | two panels, `data-panel-size="50.0"`, **384px each**, visible | side-by-side, draggable |
| 390 | two panels, **width 0**, not visible | split disabled |

So the desktop split survives all the way down to 768px, where each pane is only 384px
wide — a passage column of ~384px is uncomfortably narrow for sustained reading, but it
does not break.

---

## 3. Mobile (390 × 844) — Reading runner

The split does **not** become a tab switcher. It becomes a **stacked dual-pane**:

```
┌──────────────────────────────┐
│ ←    🕐 48:49  [Finish Test] │  top bar
├──────────────────────────────┤
│ Part 1 — …questions 1–13     │  part strip
├──────────────────────────────┤
│ William Gilbert and Magnetism│
│ passage text…                │  ← passage pane, ~339px tall
│                        ▐ scrollbar
├──────────────────────────────┤
│ Questions 1–7                │
│ instructions, heading list…  │  ← questions pane, own scrollbar
│                        ▐     │
├──────────────────────────────┤
│ ‹ (Part 1) 1 2 3 4 5 6 7 8 9 ›│  navigator + h-scrollbar
└──────────────────────────────┘
```

Measured: the passage panel is **390 × 339 px** — roughly 40% of the viewport height, with
the questions pane taking a similar band below and the navigator pinned at the bottom.

### Assessment

This is precisely the pattern our brief tells us not to ship: *"Do not merely squeeze the
desktop split screen."* Each pane gets ~340px of height, so on a phone you read a passage
through a four-line window while answering through another four-line window. Both panes
scroll independently, which compounds the problem — you lose your place in both at once.

The navigator also gains `Scroll left` / `Scroll right` arrow buttons **and** a visible
horizontal scrollbar for the question chips, so the chip row is doubly scrollable.

---

## 4. Mobile (390 × 844) — Listening runner

Single column throughout (it is single-column on desktop too), so it degrades gracefully.
Header compresses to `timer · play · 0:00 ▬ 8:12 · Finish Test`. No overflow. This is the
better-behaved of the two runners on mobile, simply because there was no split to collapse.

---

## 5. Mobile (390 × 844) — Reading library

Cards stack to a single column, full width. Filter controls (`Mock Test` toggle,
`All tasks` dropdown) stack above the list. The `Part 1 / Part 2 / Part 3` buttons stay on
one row inside each card (they are `flex-1` with `min-w-0`). No overflow. This works fine.

---

## 6. Global chrome across breakpoints

- The **left sidebar** is a collapsible rail driven by `data-collapsed`; at small widths a
  `sm:hidden` section-title button replaces it.
- The **top nav** is a single row of ten links at desktop width.
- There is **no bottom tab bar** on mobile — navigation stays in the collapsed header.

---

## 7. A rendering caveat discovered during this audit

The product **stops rendering entirely while the browser window is minimised**: timers are
throttled to roughly one tick per minute, React never completes hydration, and
`document.body.innerText` stays empty while `document.hidden === true`. A 90-second polling
loop took **821 seconds** of wall time in that state.

This is normal Chromium background throttling rather than a CathoVen bug, but it has two
consequences worth recording:

1. **For this audit:** all measurements above were taken with page visibility forced on via
   CDP (`Emulation.setFocusEmulationEnabled` + `Page.setWebLifecycleState: active`), so the
   numbers are real and not artefacts of a throttled tab.
2. **For our build:** a timed exam must not depend on `setInterval` ticking to stay
   correct. Our deadline-timestamp design already handles this — remaining time is always
   recomputed as `deadline − now` on wake — but Phase 5 QA should explicitly test a
   minimise/restore cycle mid-test.

---

## 8. Requirements for our Phase 5/14 responsive work

1. Below `md` (768px), give the passage a **deliberate mode**, not a squeezed pane —
   either a Passage/Questions segmented switcher or a collapsible passage sheet that can
   be expanded to full height.
2. Keep the question navigator reachable without a nested horizontal scrollbar (a bottom
   sheet listing questions in a grid is better than a scrolling chip strip).
3. At 768px, consider giving the passage more than 50% — a 60/40 split reads better at
   that width.
4. Verify at all six brief-mandated sizes (375×812, 390×844, 768×1024, 1280×800,
   1440×900, 1920×1080); this audit covered three of them on the reference product.
