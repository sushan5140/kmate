# P2 — Community intelligence and feature-gap audit
Date: 2026-11-26. Scope: qualitative discovery, not production deployment or promotion. P1.1 auth/privacy work remains parked.

## Evidence and methodology
Targeted search of public r/GKSScholarship threads, deduplicated by post URL. This is a convenience sample, not representative demand, not an estimate of conversion, and not authority for scholarship rules. No usernames or personal profiles copied; no replies posted. Source dates below are thread dates. Cross-check current repository routes and components, not stale search-engine copies of the homepage.

| ID | Date | Observed need | Source |
|---|---|---|---|
| E01 | 2026-11-22 | Graduate professor contact, support letters, study plan, documents | [Thread](https://www.reddit.com/r/GKSScholarship/comments/1y2lxud/gks_2027_phd_aspirant_aics_need_suggestions_on/) |
| E02 | 2026-11-23 | Language-test sequencing, department verification, document lead time, evidence-based study plan | [Thread](https://www.reddit.com/r/GKSScholarship/comments/1y3jwzg/gksg_2027_university_track_how_should_i/) |
| E03 | 2026-11-25 | NIIED round status and portal interpretation | [Thread](https://www.reddit.com/r/GKSScholarship/comments/1y5az39/anyone_else_passed_the_1st_round_for_gksu_2027/) |
| E04 | 2026-10-02 | Receipt confirmation, digital/physical document sets, LOR copies, interview timing | [Thread](https://www.reddit.com/r/GKSScholarship/comments/1wvtnum/has_anyone_received_an_update_from_their/) |
| E05 | 2026-10-23 | Apostille without underlying certificates, missing-document follow-up | [Thread](https://www.reddit.com/r/GKSScholarship/comments/1xdfge4/konyang_gksu_2027_interview_updates_missing/) |
| E06 | 2026-11-16 | Connecting with others in the same selection stage | [Thread](https://www.reddit.com/r/GKSScholarship/comments/1xxhn1b/finding_first_round_selected_applicants_all_over/) |
| E07 | 2026-11-15 | Expected graduation and GPA conversion evidence | [Thread](https://www.reddit.com/r/GKSScholarship/comments/1xwx4r9/reminder_for_gksg_applicants/) |
| E08 | 2026-11-11 | Whether to use an older LOR form for the next cycle | [Thread](https://www.reddit.com/r/GKSScholarship/comments/1xt9khe/gks_g_2027_advice_on_using_2026_form_5/) |
| E09 | 2026-08-11 | Informal professor interview before university-track application | [Thread](https://www.reddit.com/r/GKSScholarship/comments/1vldtri/has_anyone_had_an_unofficialpreapplication/) |
| E10 | 2026-05-09 | Department-specific language and extra document requirements | [Thread](https://www.reddit.com/r/GKSScholarship/comments/1t815of/help_for_additional_document_requirement/) |

Official reference boundary: [2027 GKS-U notice](https://www.studyinkorea.go.kr/ko/notice/scholarshipsRead.do?bbsId=BBSMSTR_000000000461&nttId=4522), [2026 GKS-G notice](https://studyinkorea.go.kr/ko/plan/gksNoticeRead.do?bbsId=BBSMSTR_000000000461&nttId=4420). No general 2027 GKS-G guideline was identified in the search on this date. Historical requirements must remain labeled and must not become binding 2027 rules. Community reports are leads, never official deadlines or eligibility decisions.

## Existing capability crosswalk
- Requirement Checker (app/requirement-checker/page.tsx): route-specific university evidence, cycle labels, unknown requirements remain unknown. Extend deep links and verification workflows; do not duplicate the checker.
- Application Readiness (app/application-readiness/page.tsx): document and university checklist, GKS-U route tools, form assistant, manual final checks. Extend for submission tracking and graduate pre-cycle planning rather than a second readiness page.
- Home application dashboard (components/home/application-dashboard.tsx): saved application + document progress and verified deadline/notice feed. Saved application model (lib/applications/model.ts) has active/archived state, not a per-institution selection-stage tracker.
- Apostille Guide (app/apostille/page.tsx), Mistakes, GKS Assistant and FAQ Trends: already exist; address evidence gaps and contextual discoverability rather than build parallel FAQ or apostille tools.
- Scholarship Studio has a browser-local document vault (components/scholarships/scholarship-studio.tsx). Do not create another vault or upload private documents.
- Connections (app/requests/page.tsx): existing applicant matching. A dedicated stage filter and professor outreach workflow were not found in targeted code search; confirm against full checkout before implementation.
- IELTS reference documents exist; these do not establish that a language preparation feature is deployed.
- No production browser verification in P2; search crawler copies can be older than repository contents.

## Ranked P3 backlog
Ranks are editorial judgments based on the sample, current seasonal relevance and reuse; not empirical demand scores.

1. Graduate pre-cycle preparation hub (E01 E02 E07 E08): extend readiness, not a new dashboard. A dated personal task plan for requesting transcripts, contacting referees, shortlisting departments, verifying language requirements, planning expected graduation evidence and drafting essays. Label GKS-G 2026 references historical; no invented 2027 dates, forms or eligibility. Link to existing tools. Acceptance: guest/read-only experience works, no sign-in needed for static guidance, no private data collected, no claim that old forms are valid.
2. Professor/lab outreach tracker (E01 E09): private, user-entered institution, department, official faculty URL, contact date, reply status, notes; distinguish informal support from formal scholarship eligibility. Use browser-local persistence with clear device/shared-browser warning if not account-scoped. No automated email, scraped personal contacts, admission probability or fabricated faculty listings. Acceptance: add/edit/remove/empty state, refresh persistence and clear local data; unverified records remain marked user-entered.
3. Application submission and selection-stage tracker (E03 E04 E05 E06): extend saved application model with institution-specific user-entered milestones and confirmation state; keep verified deadlines separate. Mark status as self-reported, never imply portal access; do not expose stage to others by default. Acceptance: route-aware entries, no mixing of GKS-U/GKS-G or cycles, clear reset, no invented results.
4. Department verification worksheet (E02 E10): reuse checker; compare language test/waiver, professor consent, extra documents and submission format by official source, checked date and unknown state. Acceptance: missing information stays unknown; older cycle evidence clearly marked.
5. Personal statement/study plan evidence builder (E01 E02): outline, project-to-goal mapping and consistency self-check, no AI-generated claims or invented achievements. Prefer extending existing studio/form tools after full inspection.
6. Document packet final check (E04 E05 E08): show certificate + authentication + any required translation, recipient-specific delivery/copy rules with sources; do not assume a universal copy count or recommendation form. Extend existing readiness and apostille surfaces.
7. Stage-based peer discovery (E06): defer until sufficient active users and opt-in privacy controls; no implied community activity or public contact exposure.

## Promotion fit (not executed)
Answer the actual question first; link to existing KMate tool only when directly useful and permitted by community rules. Disclose builder affiliation. No duplicate promotional posts, bulk replies, automated unsolicited messaging or claims of official affiliation. Check moderation rules before each community. P2 does not authorize outreach or P3 deployment.

## Exit gate
P2 initial audit complete: ten distinct threads, official cycle boundary, repo crosswalk, ranked backlog and acceptance criteria. Evidence is Reddit-only; Facebook/Discord/YouTube not audited here, no community-wide frequency estimates, no authenticated end-to-end tests. P3 candidate: graduate pre-cycle preparation hub first, followed by professor outreach and selection-stage tracking. P1.1 privacy/account deletion and OAuth remain unverified and untouched.
