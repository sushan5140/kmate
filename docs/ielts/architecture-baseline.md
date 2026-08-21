# IELTS Platform — Architecture Baseline (Phase 0)

Audit of the existing KMate codebase, performed before any IELTS work, so the new
assessment product reuses what is already here instead of introducing a parallel stack.

Audited on branch `feature/ielts-platform`, cut from `main` @ `986f34f`.

---

## 1. What this codebase currently is

KMate is a **Global Korea Scholarship (GKS) applicant community platform** — profiles,
connections, messaging, an interview question database, an AI mock-interview trainer,
scholarship/university reference data, and an admin moderation surface. It is **not**
currently an assessment product; nothing IELTS-related exists yet.

The IELTS platform is therefore a **new vertical inside an existing, mature app**, not a
greenfield build. It inherits the app shell, auth, database, design tokens, and
deployment pipeline.

---

## 2. Framework and tooling

| Concern | Actual value |
|---|---|
| Framework | Next.js **16.2.9**, App Router |
| React | 19.2.4 |
| Language | TypeScript 5, `strict: true`, `noEmit`, path alias `@/*` → repo root |
| Package manager | **npm** (`package-lock.json` present; no pnpm/yarn lockfile) |
| Styling | **Tailwind CSS v4** via `@tailwindcss/postcss`, no `tailwind.config` file — theme is declared in CSS |
| Icons | `lucide-react` |
| Animation | `framer-motion` v12 |
| Class merging | `clsx` + `tailwind-merge`, wrapped as `cn()` in `lib/cn.ts` |
| Markdown | `react-markdown` |
| PDF | `@react-pdf/renderer` |
| AI SDK | `@anthropic-ai/sdk` |
| Browser automation | `playwright` (devDependency, used by ad-hoc regression scripts) |
| Deployment | Vercel (`vercel.json`, region `sin1`), `.vercel/` present |

> **Critical convention (from `AGENTS.md`):** Next.js 16 renamed `middleware.ts` →
> `proxy.ts`, exporting `async function proxy(request)`. This repo already follows it.
> Do not write `middleware.ts`.

### npm scripts that actually exist

```
dev, build, start, lint, seed:universities, seed:mistakes, seed:eca
```

There is **no `typecheck` script and no `test` script.** See §8.

---

## 3. Routing

App Router, all routes under `app/`. Conventions observed:

- Pages are **async Server Components** that call an auth guard first, fetch data
  server-side, then hand plain serializable props to a client component.
- Client interactivity lives in `components/<feature>/*.tsx` with `"use client"`.
- Route handlers live under `app/api/<feature>/route.ts` and use `NextResponse.json`.
- One route group exists: `app/(info)` for public marketing/legal pages.
- Dynamic segments in use: `app/profile/[username]`, `app/api/mistakes/[id]/upvote`.

Existing top-level routes: `/home`, `/interview-db`, `/timeline`, `/eca`, `/mistakes`,
`/notices`, `/scholarships`, `/gks`, `/official-guidelines`, `/apostille`,
`/scholar-stats`, `/messages`, `/requests`, `/profile`, `/settings`, `/onboarding`,
`/login`, `/admin/*`.

**`/ielts` is free.** No collision.

---

## 4. Authentication

Supabase Auth (Google OAuth via `lib/hooks/use-google-sign-in.ts`), session in cookies.

The auth flow is unusual and must be respected:

1. `proxy.ts` runs on every request except `_next/static`, `_next/image`, `favicon.ico`.
2. It **deletes** any client-supplied `x-kmate-user-id` / `x-kmate-user-email` headers
   (anti-spoofing), then calls `supabase.auth.getUser()` once.
3. Signed-out users hitting a non-public path are redirected to `/login?next=…`.
   `PUBLIC_PATHS` = `/`, `/login`, `/auth`, `/about`, `/guidelines`, `/api/cron`.
4. For signed-in users it forwards the **already-validated** id/email as request headers.
5. Server Components read those headers via `getAuthenticatedUser()` — **no second
   round-trip to Supabase Auth.**

Guards in `lib/supabase/auth-server.ts`:

| Function | Use |
|---|---|
| `getAuthenticatedUser()` | Returns `{ id, email }` or `null`, header-based, free |
| `requireOnboarded(nextPath)` | Page guard: redirects to `/login` or `/onboarding` |
| `isAuthorizedAdmin(user)` | Two-factor admin check: `profiles.is_admin` **and** `ADMIN_EMAIL` match; fails closed |
| `requireAdmin()` | Admin page guard, `notFound()` rather than redirect |
| `createClient()` | Cookie-aware, anon-key, **RLS-respecting** Supabase client |

**Implication for IELTS:** every `/ielts/*` page gets auth for free and must call
`requireOnboarded("/ielts/...")`. No new auth code is needed.

### CSP

`proxy.ts` builds a **nonce-based CSP per request**. Notable current values:

- `script-src 'self' 'nonce-…' 'strict-dynamic'`
- `style-src 'self' 'unsafe-inline'` (framer-motion writes `element.style.cssText`)
- `img-src 'self' blob: data:`
- `media-src` is **not declared** → falls back to `default-src 'self'`
- `connect-src 'self' <supabase https> <supabase wss>`

**Implication for Listening (Phase 7):** audio served from the app's own origin
(`/public` or a same-origin route) is the path of least resistance. Supabase Storage is
already in `connect-src`, but `media-src` inherits `default-src 'self'`, so an
`<audio>` element pointing at the Supabase Storage origin would be **blocked**. Either
serve audio from `self`, or add a scoped `media-src` exception in `proxy.ts` the same
way the mock-interview route scopes its own exceptions. This is a known,
already-solved-shape problem in this repo — do not loosen the policy app-wide.

---

## 5. Data layer

**Supabase Postgres.** No ORM — the Supabase JS client is used directly with string
column names. Schema is a single idempotent file: `supabase/schema.sql` (1,595 lines),
organised in four passes: tables → functions → RLS policies → triggers + seed.

Two client factories, deliberately distinct:

| Module | Key | RLS | Used by |
|---|---|---|---|
| `lib/supabase/server.ts` → `getSupabaseAdmin()` | service-role | **bypassed** | Route handlers, seed scripts, cached-content reads |
| `lib/supabase/auth-server.ts` → `createClient()` | anon | **enforced** | Server Component page reads scoped to the viewer |
| `lib/supabase/browser-client.ts` | anon | enforced | Client-side auth + realtime |

RLS is enabled on every user-owned table, with owner-scoped policies. The closest
existing precedent to an IELTS attempt is the AI Mock Interview pair:

```sql
interview_sessions (id, user_id, category, question_count, max_mid_pauses,
                    mid_pauses_used, status, final_feedback_text, started_at, ended_at)
interview_session_questions (id, session_id, question_index, question_text,
                             transcript, ...metrics..., unique (session_id, question_index))
```

with policy `interview_sessions_owner_all ... for all` plus an `exists (select 1 from
interview_sessions s ...)` policy on the child table. **The IELTS attempt model should
mirror this shape exactly** — a parent attempt row owned by `user_id`, a child answer
table reached through it.

Also note `status text not null default 'in_progress' check (status in ('in_progress',
'completed', 'abandoned'))` — snake_case status enums as CHECK constraints, not Postgres
enum types. Follow that.

Static reference content lives in `data/*.json` / `data/*.ts` and is loaded by seed
scripts (`supabase/scripts/seed-*.ts`, run via `tsx`). **This is the established pattern
for content that ships with the repo** and is directly reusable for IELTS test fixtures.

---

## 6. Styling and component system

No component library (no shadcn, no `components.json`). Hand-rolled primitives in
`components/ui/`:

```
back-link.tsx  button.tsx  card.tsx  connect-button.tsx
searchable-select.tsx  track-badge.tsx  vote-buttons.tsx
```

- `Button` — variants `primary | secondary | ghost | danger`, sizes `sm | md`,
  `rounded-full`, `forwardRef`.
- `Card` — `rounded-2xl bg-surface p-5 shadow-card ring-1 ring-hairline`, optional
  `interactive` hover lift. Plus `MicroLabel`.
- `SearchableSelect` — reusable filter/combobox; likely reusable for test-library filters.

Design tokens are CSS custom properties in `app/globals.css`, exposed to Tailwind via
`@theme inline`:

```
canvas #f7f9fb   surface #ffffff   ink #12141c   muted #5b6472
primary #3e63dd  border #e7eaf0    hairline / hairline-strong
success #2fa36b  danger #cf4b45    gold #b98a2f
gks-u #e8794f    gks-g #3e63dd
shadow-xs / shadow-card / shadow-card-hover / shadow-pop
```

Fonts: **Manrope** (sans) + **Instrument Serif** (serif display), via `next/font/google`,
bound to `--font-sans` / `--font-serif`.

Utility classes already defined: `.grain-overlay`, `.glass-surface`, `.grid-texture`,
`.text-balance`, `.tabular-nums`. Global `:focus-visible` is a 2px primary outline —
accessibility baseline already exists.

**This palette is calm, light, and low-chroma — already the right register for an exam
environment.** Phase 14 should extend it (a reading-surface tone, answered/flagged/
correct/incorrect states), not replace it.

### Layout shell

`app/layout.tsx` → `AppShell` (`components/layout/app-shell.tsx`):

- Signed out → `Navbar` + content + `Footer`.
- Signed in → `AuthedNav` (fixed 210px left sidebar on `md+`, sticky 56px top bar on
  mobile) and content wrapped in `md:pl-[210px]`.

Nav is driven by a single array, `lib/nav-items.ts` (`NAV_ITEMS: NavItem[]`), consumed by
**both** sidebar and mobile top bar. Adding IELTS to the nav is one entry there.

**Responsive breakpoint in practice: `md` (768px) is the desktop/mobile split.** The
Reading split-pane must therefore be `md:grid-cols-2` with a deliberate mobile mode below it.

---

## 7. Validation

There is **no direct validation dependency in `package.json`.** `zod@4.4.3` exists in
`node_modules` only as a transitive dependency of `@anthropic-ai/sdk`.

Current practice is **hand-rolled guards**: `as const` string-literal tuples in
`lib/constants.ts` (`TRACKS`, `EMBASSY_TYPES`, `CONTACT_TYPES`, …) with derived
`(typeof X)[number]` types, checked in route handlers via `ARRAY.includes(value as ...)`
plus manual length/type checks. Domain rules live in `lib/validation/*.ts`.

**Recommendation:** promote `zod` to a direct dependency and use it for the IELTS content
schema. Justification: the brief mandates a validated import pipeline (Phase 12) that must
reject malformed tests with useful errors — hand-rolled guards do not scale to a
recursive, discriminated-union question model with ~28 question types. Zod is already
resolved in the lockfile at a known version, so this adds no new supply-chain surface and
no bundle cost server-side. It will be used **only for IELTS content/import validation**;
existing hand-rolled guards elsewhere stay as they are.

---

## 8. Testing

**There is no test runner in this repository.** `npm test` fails with
`Missing script: "test"`.

What exists instead: `supabase/scripts/regression/` — 12+ standalone `tsx` scripts, each
independently runnable, several driving a real browser via `playwright`, documented in
`supabase/scripts/regression/README.md`. Its own header says: *"Standalone `tsx` scripts
(no test runner configured in this project)"*. Some need a **production build** (`next
build` + `next start`) because a Turbopack dev-mode quirk broke cookie auth for them.

### Phase 0 verification results

| Command | Exists? | Result |
|---|---|---|
| `npm run lint` | yes | **83 errors, 391 warnings** — *all* from untracked non-app directories: `gks-rag/.venv/**` (Python venv JS assets), `meno-j/`, `meno-j-v1-backup/`, `reel-assets/`. Pre-existing, unrelated to this work. |
| `npx eslint app components lib supabase proxy.ts next.config.ts` | — | **Clean, 0 problems.** This is the true app-source lint baseline. |
| `npx tsc --noEmit` (no `typecheck` script) | — | **Clean, exit 0.** |
| `npm test` | **no** | `npm error Missing script: "test"` |

> The untracked scratch directories are inside ESLint's scope because `eslint.config.mjs`
> only ignores `.next/`, `out/`, `build/`, `next-env.d.ts`. Fixing that is out of scope
> for the IELTS work and would touch shared config; the scoped command above is used as
> the baseline instead.

**Recommendation for later phases:** the brief mandates unit tests for schemas (Phase 3),
every question renderer (Phase 4), and scoring edge cases (Phase 9). Add **Vitest** +
`@testing-library/react` + `jsdom` and a `test` script in Phase 3, when the first tests
are actually written. Vitest is chosen over Jest because it needs no Babel config, reads
`tsconfig` paths through a small Vite config, and runs TS natively — matching how `tsx`
is already used here. Browser-level journeys (Phases 8, 17) continue to use the existing
Playwright-script convention rather than a new e2e framework.

---

## 9. Existing pieces the IELTS platform will reuse

| Need | Reuse |
|---|---|
| Auth on every IELTS page | `requireOnboarded()` |
| Route-handler auth | `getAuthenticatedUser()` |
| Owner-scoped reads | `createClient()` (RLS) |
| Privileged writes | `getSupabaseAdmin()` |
| Abuse protection on submit/autosave | `lib/rate-limit.ts` → `checkRateLimit(key, max, windowMs)` |
| Nav entry | `lib/nav-items.ts` |
| Page chrome, sidebar, mobile top bar | `AppShell` / `AuthedNav` |
| Cards, buttons, filters | `components/ui/*` |
| Colour, type, shadow, focus ring | `app/globals.css` tokens |
| Attempt/answer table shape + RLS | `interview_sessions` / `interview_session_questions` precedent |
| Shipping content with the repo | `data/*.json` + `supabase/scripts/seed-*.ts` |
| Browser QA | `playwright` devDependency + `supabase/scripts/regression/` convention |

**Nothing needs to be rewritten.** No redesign of existing systems is proposed.

---

## 10. Recommended IELTS architecture

Layered so that **UI, engine, and content are three separate things**, per the brief.

```
data/ielts/                      <- CONTENT (JSON, no code)
  tests/                           validated test documents
  source-audit/                    reference catalogue + rights registry
  band-scales/                     raw-to-band mapping tables (swappable config)

lib/ielts/                       <- ENGINE (pure TS, no React, unit-testable)
  schema/           zod schemas + inferred types (test, section, question, source)
  question-types.ts registry of every supported question type
  scoring/          normalisation, comparison, raw score, band estimation, analytics
  attempts/         attempt lifecycle, autosave payloads, resume reconstruction
  timer.ts          deadline-timestamp arithmetic (never a decrementing counter)
  content/          loader: reads data/ielts, validates, caches

components/ielts/                <- UI (React, content-agnostic)
  questions/        QuestionRenderer + one component per question type
  runner/           shell, split-pane, passage panel, navigator, timer, submit
  library/          test cards, filters, completion state
  results/          score summary, breakdowns, answer review
  audio/            listening player

app/ielts/                       <- ROUTES (Server Components + guards)
app/api/ielts/                   <- route handlers (attempt start/save/submit)

scripts/ielts/                   <- IMPORT PIPELINE (tsx, per repo convention)
supabase/schema.sql              <- attempt tables appended, same 4-pass structure
```

### Key design decisions taken now

1. **Content never lives in React.** A test is a validated JSON document; components
   receive it as props. This is what makes Phase 19's "insert lawful source material
   later without changing the application" actually true.
2. **One engine, two modules.** Academic and General Training differ in *content shape*
   (3 passages vs. 3 sections with multiple short texts), not in mechanics. The section
   model is generic: a section owns N source texts and N question groups. Phase 6 is
   therefore configuration, not a second implementation.
3. **Scoring is a pure function** in `lib/ielts/scoring/`, importable by a unit test with
   no DOM and no database.
4. **Band mapping is data**, in `data/ielts/band-scales/`, labelled *Estimated Band*
   everywhere in the UI — never presented as an official IELTS band.
5. **The timer is a deadline timestamp** persisted with the attempt. Remaining time is
   always `deadline - now`, so refresh, route change, rerender, and tab suspension all
   recover correctly by construction.
6. **Rights metadata is required by the schema.** A test document without a valid
   `source.type` fails validation and cannot be imported. Restricted/unclear sources
   become placeholder records linked to the source registry, never content.
7. **Server-authoritative submission.** Correct answers are never sent to the client
   during an exam-mode attempt; scoring happens in a route handler.

### Open items carried into later phases

- Promote `zod` to a direct dependency (Phase 3).
- Add Vitest + Testing Library + jsdom and a `test` script (Phase 3).
- Decide `media-src` CSP handling for Listening audio (Phase 7).
- Append IELTS tables to `supabase/schema.sql` following the existing 4-pass order
  and owner-scoped RLS precedent (Phase 3).
