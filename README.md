# KMate

An application-intelligence and preparation platform built specifically for **Global Korea Scholarship (GKS)** applicants.

KMate turns scattered GKS rules and applicant tasks into one workflow: current-cycle guideline support, route-aware university checks, document readiness, deadline context, interview preparation and privacy-aware applicant connections.

Community is part of the product, but it is not the source of truth for official rules. Current guideline evidence stays separate from applicant experience.

## What KMate includes

- Applicant profiles for GKS-U and GKS-G
- Explicit GKS-U Embassy vs University Track route handling
- 2027 GKS-U guideline-grounded assistant and quick-reference tools
- Route-aware Application Readiness and Requirement Checker
- Cycle-tagged university eligibility and university-specific detail
- Discovery by program, major, year and target universities
- Connection requests and private in-app messaging
- Revoke, block and report flows
- Scholar/application profile data and preparation resources
- Interview-question resources
- GKS document/apostille guidance with source links and last-checked dates
- Cycle-tagged university eligibility data and official university-choice validation
- Admin moderation and audited access to sensitive management actions

## Privacy model

KMate is intentionally designed so applicants do not need to expose personal contact details publicly.

External contact information stays in a private contact vault rather than appearing on public profiles. Accepted connections can use KMate's in-app messaging, while administrative access to sensitive information is separately gated and logged.

## Stack

- Next.js 16
- React 19
- TypeScript
- Supabase Auth / Database / SSR
- Tailwind CSS
- Playwright
- xAI/Grok and Anthropic SDK integrations for selected AI-assisted features

## Why I built it

A GKS application spans national guidelines, embassy or university instructions, document preparation, deadlines, interview preparation and applicant communities. Those pieces are useful individually, but they are easy to mix across cycles or routes.

KMate is designed around questions such as:

- Which official rule applies to my route and stage?
- Which university-specific detail is current, and which one still needs reverification?
- What documents are ready, missing or conditional?
- Which applicants share my program, major or target universities?
- Which preparation material is official guidance and which is community experience?

KMate turns those questions into one application workflow rather than one more general forum.

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

When `data/gks-universities.json` is refreshed for a new cycle, `npm run seed:universities` can reconcile it manually. Production also reconciles and verifies the catalog in daily maintenance, and records the verification result in automation health.

## Data accuracy

GKS rules, participating universities and document requirements can change each application cycle. KMate is not an official NIIED service. Current-cycle national rules are kept separate from older university-specific source material, and previous-cycle data is never meant to be presented as current. Applicants should always verify final requirements against the current **Study in Korea / NIIED** guidelines and their first-round institution.

## Project status

Launch-candidate personal project. Release changes are gated by lint, TypeScript, 2027 GKS integrity checks, readiness regression tests and a dedicated release audit before preview/production deployment.

This repository combines full-stack development, structured scholarship data, privacy design, applicant workflow tooling and a deliberately conservative official-source policy.
