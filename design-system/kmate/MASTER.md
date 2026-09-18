# KMate design system

## Product character
KMate is a working desk for GKS applicants: official rules, application progress, university requirements, interview preparation, and applicant connections. It should feel precise, trustworthy, calm, and unmistakably tied to application work rather than like a generic SaaS dashboard.

## Design direction
**Korean application desk** — cool paper surfaces, deep indigo ink, restrained document rules, and a small vermilion seal accent. The application workflow is the memorable visual element. Decoration stays quiet.

This contract synthesizes the user-selected design references:
- emilkowalski/skills
- anthropics/skills frontend-design
- nextlevelbuilder/ui-ux-pro-max-skill
- hamen/material-3-skill
- multica-ai/andrej-karpathy-skills
- delphi-ai/animate-skill
- kylezantos/design-motion-principles
- AgentsORG/design-engineering

## Color roles
- Canvas / paper: `#F5F7F6`
- Surface: `#FFFFFF`
- Ink / chrome: `#172036`
- Muted text: `#667085`
- Primary action / link: `#2F5C9A`
- Primary hover: `#274C7E`
- Official seal / GKS-U: `#AA4D3B`
- Verified / success / celadon: `#47796C`
- GKS-G / secondary data: `#665E8C`
- Resource / caution: `#8A6A33`
- Borders: `#DCE2E7`

Use brand and semantic color in small signals: action fills, active rails, progress, badges, status dots. Do not tint whole page sections merely to make them different.

## Typography
- Manrope is the primary interface family.
- Headings carry hierarchy through size, weight, and spacing before color.
- Body copy is at least 12px, normally 13–14px.
- Avoid tracked all-caps eyebrows. Category labels are sentence case unless the content itself is an acronym.
- Keep line length under roughly 80 characters.

## Shape and surface
- Default radius: 10–12px.
- Large workspace surfaces may use 14px.
- Use borders and spacing before shadows.
- Base cards have no floating shadow. Interactive surfaces may change border/background on hover, not jump dramatically.
- Do not nest decorative cards inside decorative cards.

## Layout
- Desktop left rail remains stable.
- Home prioritizes the current application, then checklist/deadlines, then tool discovery.
- Tool discovery is an index/list, not a card gallery.
- Tabs use underline/navigation semantics rather than segmented-pill styling.
- Numbering is reserved for actual sequences (application steps and ordered university choices).

## Motion
- Frequent navigation and keyboard actions are instant or near-instant.
- Press feedback: scale around 0.975 for 100–160ms.
- Hover/color transitions: about 150ms.
- Occasional drawers/modals may use 180–250ms ease-out.
- Animate transform/opacity where possible. Progress uses transform scale rather than width animation.
- Always respect `prefers-reduced-motion`.

## Accessibility
- Normal text contrast >= 4.5:1.
- Visible keyboard focus.
- Touch targets >= 44px for primary interactive controls.
- Icon-only buttons require accessible labels.
- Empty, loading, error, and disabled states are designed states, not placeholder text.

## Voice
Plain, useful, and specific. Labels describe the user's task, not the implementation. Actions use verbs that match what happens.
