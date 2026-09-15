# KMate

A community and preparation platform built specifically for **Global Korea Scholarship (GKS)** applicants.

KMate is designed around a problem I encountered while preparing for GKS: applicants are scattered across large social groups, but finding people with the same track, major, application year or target universities is unnecessarily difficult.

Instead of another general forum, KMate focuses on structured applicant discovery, preparation resources and privacy-aware connections.

## What KMate includes

- Applicant profiles for GKS-U and GKS-G
- Discovery by track, major, year and target universities
- Connection requests with contact details hidden by default
- Two-sided contact reveal after acceptance
- Revoke, block and report flows
- Scholar/application profile data and preparation resources
- Interview-question resources
- GKS document/apostille guidance with source links and last-checked dates
- Cycle-tagged university eligibility data and official university-choice validation
- Admin moderation and audited access to sensitive management actions

## Privacy model

KMate is intentionally designed so applicants do not need to expose personal contact details publicly.

Contact information stays hidden until both sides establish a connection, and administrative access to sensitive information is separately gated and logged.

## Stack

- Next.js 16
- React 19
- TypeScript
- Supabase Auth / Database / SSR
- Tailwind CSS
- Playwright
- Anthropic SDK integration for selected AI-assisted features

## Why I built it

GKS applicants frequently rely on large Facebook, Reddit, Discord, Telegram or WhatsApp groups. Those communities can be helpful, but they are not structured around questions such as:

- Who is applying through the same track as me?
- Who is targeting the same university?
- Who is in the same major?
- What did successful applicants actually prepare?
- Which requirements apply to my track?

KMate turns those questions into product features rather than leaving applicants to search through unrelated posts.

## Engineering highlights

### Applicant discovery

Profiles can be filtered around meaningful GKS attributes rather than generic social-network information.

### Privacy-aware connections

Contact details are not publicly exposed. Connection state controls when information becomes visible, with revoke/block/report behavior built into the product.

### GKS-specific data

University eligibility and application rules are represented as structured, cycle-tagged data instead of being hard-coded into isolated pages. GKS-U is refreshed against the 2027 NIIED/Study in Korea guideline while older university-specific detail is explicitly labeled by its source cycle. The university seed reconciles stale eligibility rows instead of silently carrying previous-cycle options forward.

### Admin and moderation

Administrative surfaces are protected separately from ordinary user access, and sensitive admin actions are logged.

## Repository structure

- `app/` — Next.js routes and server-rendered application surfaces
- `components/` — product UI and reusable components
- `lib/` — application/service logic
- `supabase/` — database-related setup, migrations and seed tooling

## Running locally

```bash
npm install
npm run dev
```

A configured Supabase project and the required environment variables are needed for authenticated features.

Before merging changes that affect GKS rules or readiness data, run:

```bash
npm run verify:quick
```

When `data/gks-universities.json` is refreshed for a new cycle, run `npm run seed:universities` against the intended Supabase project so stale eligibility rows are reconciled and new current-cycle universities are inserted.

## Data accuracy

GKS rules, participating universities and document requirements can change each application cycle. KMate is not an official NIIED service. Current-cycle national rules are kept separate from older university-specific source material, and previous-cycle data is never meant to be presented as current. Applicants should always verify final requirements against the current **Study in Korea / NIIED** guidelines and their first-round institution.

## Project status

Actively developed personal project.

This repository is one of my main software projects and combines full-stack development, structured scholarship data, privacy design and applicant-community tooling.
