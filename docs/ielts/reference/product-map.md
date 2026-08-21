# CathoVen IELTS — Product Map (Phase 1 reference)

Internal development reference. Observed 2026-08-21 from an authenticated free-tier
account, Microsoft Edge 151, viewport 1440×900 unless noted.

> **Scope note.** This documents *what the reference product does*, so our own
> implementation can be designed deliberately — including where we intend to differ.
> No passages, questions, audio, or answer keys are reproduced here.

---

## 1. Hosts

| Host | Role |
|---|---|
| `www.cathoven.com` | Marketing site only. Nav: Speaking, Writing, Listening, Reading, Pricing. |
| `ielts.cathoven.com` | **The product.** Next.js App Router SPA. |
| `api.cathoven.com` | Backend origin (notification WebSocket observed). |
| `d3fqmh1es4k93i.cloudfront.net` | Listening audio CDN (MP3). |
| `experiments.cathoven.com` | PostHog (feature flags, surveys, session capture). |
| `browser-intake-datadoghq.eu` | Datadog RUM + Session Replay. |

Unauthenticated visits to `/` redirect to `/ielts/register`. Authenticated visits to `/`
redirect to `/ielts/dashboard`. Auth is Google Sign-In (GIS) via `accounts.google.com`.

---

## 2. Actual route tree

Everything lives under a single `/ielts` prefix. There is **no** `/academic` vs
`/general` split — module is a *filter*, not a route.

```
ielts.cathoven.com
├── /ielts/register                  (unauthenticated landing)
├── /ielts/login
├── /ielts/dashboard                 Home. Tabs: Home | Reports | Progress | Study Plan
│
├── /ielts/reading                   Reading library (Academic + General in ONE list)
│   └── /ielts/reading-test          Reading runner AND report, selected by query params
│         ?qid=QN<uuid>
│         &name=<display title>
│         &task=ielts_reading_academic | ielts_reading_general
│         &isCustom=false
│         &isFullTest=true
│       ...or report mode:
│         ?report=<24-hex report id>
│
├── /ielts/listening                 Listening library (18 tests)
│   └── /ielts/listening-test        Listening runner
│         ?qid=QN<uuid>&name=<title>&task=ielts_listening
│         (no isFullTest / isCustom params)
│
├── /ielts/writing                   Writing task library (5 modes)
├── /ielts/speaking                  Speaking library (not audited — out of our scope)
│
├── /ielts/reports                   History table
│   └── /ielts/reports?tab=progress  Progress analytics (Writing/Speaking ONLY)
│
├── /ielts/sample-reports            Marketing sample reports
├── /ielts/lessons                   Lesson library (0/3 completed on this account)
├── /ielts/pricing                   Subscription plans
└── /ielts/contact-us                Support
```

### Route observations that matter for our build

1. **The runner and the results view are the same route**, distinguished only by
   `?report=`. We observed a state-leak from this: after viewing a report, navigating
   to a runner URL re-appended `&report=…`, silently rendering the report instead of
   the test. We will use distinct routes.
2. **Test identity is carried in the query string, not the path.** `qid` is the real
   identifier; `name` and `task` are redundant display/branch hints that could be
   tampered with. We will use a path segment and resolve everything server-side.
3. `qid` format: literal `QN` + UUIDv4, e.g. `QN85de96d1-fe9a-4146-813a-151186351299`.

---

## 3. API surface (schema-level observation only)

All app API calls are same-origin under `/api/`, proxied to the Django-style backend.
Trailing-slash URLs 308-redirect to non-slash.

| Endpoint | Purpose |
|---|---|
| `GET /api/auth/profile` | Current user |
| `GET /api/ielts/reading` | Reading test list (metadata only) |
| `GET /api/ielts/reading/{qid}` | One reading test, **full content inlined** |
| `GET /api/ielts/listening` | Listening test list |
| `GET /api/ielts/listening/{qid}` | One listening test, full content + audio URLs |
| `wss://api.cathoven.com/ws/notification/{userId}/` | Notification socket |

**List response envelope** (paginated, DRF-style):

```
{ status, ok, count, next, previous, results: [ … ] }
```

**Detail response envelope**:

```
{ status, ok, data: { … } }
```

List item fields: `qid, question, title, task, order, is_active, created_at, updated_at, score`
— where `score` is *this user's* best score for that test (or `null`).

> **Note for us:** the detail endpoint returns the complete test **including the answer
> key material implicitly and the full passage/transcript text**. Correct answers are
> therefore resolvable client-side. Our own design must keep answer keys server-side and
> score in a route handler (already recorded as decision 7 in `architecture-baseline.md`).

---

## 4. Content model (as observed)

```
test
  qid, question, title, description, task, type,
  order, is_active, is_recommended, mock_test_order,
  created_at, updated_at,
  sections[]
    id, part, title, text, audio?, subsections[]
      id, order, title, subsection_type, text, visual,
      grid_headers, grid_cells, questions[]
        id, order, title, question_type, ielts_question_type,
        text, max_selected_options, options[]
          order, option
```

| Field | Meaning |
|---|---|
| `task` | `ielts_reading_academic` \| `ielts_reading_general` \| `ielts_listening` |
| `description` | **Free-text provenance string** — see `../source-audit` work in Phase 2 |
| `section.part` | 1-based part/passage number |
| `section.text` | Reading passage, or Listening **transcript** |
| `section.audio` | Listening only; one MP3 **per part** |
| `subsection` | A question *group* (one instruction block) |
| `subsection.subsection_type` | Layout: `regular`, `table`, `grid`, `form` |
| `subsection.text` | The group instruction (HTML) |
| `subsection.visual` | Intended image slot — **null in every case observed** |
| `grid_headers` / `grid_cells` | Table/grid layout payload |
| `question.question_type` | Control: `dropdown`, `multiple_choices`, `multiple_select`, `fill_in_the_blank` |
| `question.ielts_question_type` | The IELTS type name (see `question-types.md`) |
| `question.max_selected_options` | Multi-answer cap; also the count of answer slots consumed |

**Key structural insight:** one `question` entity may span several *answer numbers*.
A "choose THREE" question is a single entity consuming three numbered slots; a summary
with four blanks is four entities each with one slot. Summing
`max_selected_options ?? 1` across a test yields exactly **40** for every Listening test
audited. Our schema must model *question entity* and *answer slot* separately.

---

## 5. Client persistence

IndexedDB database **`cathoven`** (version 2), object stores `cache`, `settings`,
`taskQueue`, all keyed by `key`.

`cache` keys observed: `config`, `session`, `ielts-survey`, **`reading-test-storage`**.

`reading-test-storage.value`:

```
{ step, mode: "full", activePart, qid, currentPart,
  answers: { <questionId>: <value> },
  examEndsAt: <epoch ms>,          // deadline timestamp
  timerStarted: bool,
  testData: { …full test… },
  submitResult, processState, submitError }
```

Findings:

- **The timer is a deadline timestamp (`examEndsAt`), not a countdown.** This matches the
  approach we specified in `architecture-baseline.md` §10 decision 5 — independently
  validated as the right model.
- **Answers are never POSTed during the attempt.** No network write fired on answering;
  persistence is entirely local until submit.
- **There is exactly one slot** (`reading-test-storage`), so only one reading attempt can
  be resumed at a time.
- **Listening has no storage key at all** — `listening-test-storage` does not exist.
  Listening attempts are in-memory only and do not survive a refresh; the timer restarts.

### Two reproducible defects (design-against list)

1. **Attempt state is not reset when a new test starts.** Opening General Training
   Reading Test 1 immediately after an Academic Reading Test 1 attempt kept the previous
   `examEndsAt` (timer continued from 52:06 rather than restarting at 60:00), kept
   `answers: {6741: "E"}` — an Academic question id — and kept `currentPart: 2`.
2. **`?report=` leaks across navigations**, rendering the report view when a runner was
   requested (see §2.1).

---

## 6. UI stack (inferred from DOM)

- **Next.js App Router** with React streaming SSR (`$RC("B:0","S:0")` placeholders).
- **Radix UI** primitives (`data-radix-collection-item`, `data-state`, `role="combobox"`,
  `role="radio"`, `role="alertdialog"`).
- **Tailwind + shadcn/ui** conventions (`ring-offset-background`, `text-muted-foreground`,
  `bg-primary`, `border-input`).
- **react-resizable-panels** for the Reading split view (`data-panel-group`, `data-panel`,
  `data-panel-size`, `data-panel-collapsible`).
- **Recharts** on the Progress tab.
- **Cypress** is their E2E tool — every meaningful control carries a stable `data-cy`.

Hydration is slow: a cold load takes roughly **20–40 s** before content paints. The page
also stalls completely while the browser window is minimised (timers throttled,
`document.hidden === true`).

---

## 7. Areas deliberately not audited

| Area | Why |
|---|---|
| Speaking | Outside our platform's scope (Reading / Listening / Mock only). |
| Writing runner | Only its library filter model was needed, to characterise "Mock Test". |
| Lessons, Sample Reports, Study Plan wizard | Not part of the brief's feature list. |
| Purchase / subscription flow | Explicitly forbidden to modify or purchase. |
