# GKS Connect — Extracurricular Activities & Profile-Building Database (Refined)

## TL;DR
- Best-supported, genuinely multi-sourced patterns: TOPIK 3+ as a documented NIIED scoring bonus, research/publication experience anchoring the GKS-G study plan and SOP, prior work/internship experience for GKS-G career-switchers, and the official NIIED preference categories (STEM major bonus, Type B/regional university bonus, low-income background, Korean War veteran descendant status, sports/music/arts portfolio requirements).
- Several claims in the raw batch were labeled "recurring_theme" off a single reddit AMA thread or a single blog — downgraded to `single_anecdote` to keep the 3-source bar honest.
- **Data-quality flag:** 4 URLs form a spam-content-farm cluster (identical article titles/IDs across unrelated domains) and were downgraded/excluded from corroboration counts. 1 entry (K-influencer content creation) was removed entirely — unlinkable source plus leftover raw citation markup in the text, meaning it can't be verified and shouldn't be published as fact.
- Several "official NIIED preference category" claims (STEM bonus %, Type B bonus, veteran-descendant 5%) are asserted confidently by advisory blogs but each currently rests on a single source — worth verifying against the current-cycle NIIED PDF before publishing as fact, since these percentages/rules can change by cycle.

## Refined Database (JSON)

```json
[
  {
    "title": "TOPIK Level 3+ as a documented NIIED application-stage scoring bonus",
    "description": "NIIED's 2026 GKS-G guidelines state that holding TOPIK/TOPIK IBT Level 3 or above earns a documented bonus (cited as ~10% of the document-screening score). This is corroborated by an official guideline PDF, an advisory blog, and reddit threads describing applicants deliberately sitting TOPIK the cycle before applying to reach Level 3+. This is the single activity most consistently described as a direct scoring benefit rather than a soft/holistic one.",
    "target_track": "both",
    "activity_type": "language_study_topik",
    "impact_area": "scoring_points_niied",
    "source_platform": "other",
    "source_url": "https://kecseattle.org/wp-content/uploads/2026/02/2026-GKS-G-Application-Guidelines-English.pdf",
    "confidence": "recurring_theme"
  },
  {
    "title": "TOPIK Level 5–6 exempts scholars from the mandatory Korean language year",
    "description": "One advisory guide describes scholars who reach TOPIK Level 5–6 before final selection as exempted from the mandatory one-year Korean language training, entering their degree program immediately. This is currently sourced from a single blog and should be verified against the current-cycle NIIED guideline before being presented as confirmed fact — it's plausible and consistent with how TOPIK exemptions are generally described elsewhere, but not yet independently corroborated.",
    "target_track": "both",
    "activity_type": "language_study_topik",
    "impact_area": "scoring_points_niied",
    "source_platform": "blog",
    "source_url": "https://koreanlearners.com/blog/blog-10-2026-GKS-Undergraduate-Scholarship-Complete-Guide-for-Indian-Students.html",
    "confidence": "single_anecdote"
  },
  {
    "title": "TOPIK Level 5–6 unlocks an additional monthly stipend after enrollment",
    "description": "A GKS overview guide notes that reaching TOPIK Level 5–6 after enrollment earns an additional monthly living grant beyond the standard stipend, framed as a post-enrollment financial incentive rather than an application-stage scoring criterion. Single-sourced; worth verifying against current program terms.",
    "target_track": "both",
    "activity_type": "language_study_topik",
    "impact_area": "scoring_points_niied",
    "source_platform": "blog",
    "source_url": "https://www.globaladmissions.com/scholarship/gks-scholarship",
    "confidence": "single_anecdote"
  },
  {
    "title": "Submitting a high English test score (TOEFL/IELTS/TOEIC) for a separate documented preference",
    "description": "Sources corroborating the 2026 NIIED guidelines describe a named preference category during document screening for a high English proficiency score, separate from the TOPIK bonus, worth roughly 5% of total score. Only the highest submitted score counts, and it must be within two years of the announcement date per this source. Single-sourced from one guide; the underlying rule is plausible (English scoring bonuses are also referenced independently in the mistakes database) but the specific percentage should be checked against the current cycle's official PDF.",
    "target_track": "both",
    "activity_type": "language_study_topik",
    "impact_area": "scoring_points_niied",
    "source_platform": "blog",
    "source_url": "https://www.topikguide.com/global-korea-scholarship-gks-graduate/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Sustained TOPIK study (self-study, language institute, K-MOOC) to reach Level 4–6",
    "description": "The most frequently described language-prep behavior across accounts: applicants and scholars describing years of Korean study — high school classes, King Sejong Institute courses, K-MOOC, or intensive self-study — to reach TOPIK 4–6 before or during application. Some accounts separately mention taking classes without any TOPIK exam yet, sometimes using the instructor as a recommender. This spans multiple independent reddit threads and blogs and is one of the better-corroborated behavioral patterns, though 'golden key' framing in some accounts is the applicant's own belief about causation, not a confirmed outcome.",
    "target_track": "both",
    "activity_type": "language_study_topik",
    "impact_area": "general_competitiveness",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1qndcqz/i_helped_200_students_win_gks_ask_me_anything/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Research output (publication, conference presentation, or thesis) anchoring the GKS-G study plan",
    "description": "Across a reddit 'what got you selected' discussion, an advisory guide noting the research proposal reportedly carries roughly 30% of the graduate application score, and a study-plan guide from a confirmed GKS-G scholar, applicants and advisors consistently describe listing a thesis, paper, or conference presentation as a way to make the study plan and SOP concrete rather than aspirational. This now spans a firsthand reddit account, an independent advisory blog, and a confirmed-scholar's guide — a genuinely corroborated pattern for GKS-G specifically.",
    "target_track": "gks_g",
    "activity_type": "research_publication",
    "impact_area": "strengthens_study_plan",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1umdsjw/advice_on_how_to_improve_my_application/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Contacting a Korean professor before applying (GKS-G university/R-GKS track)",
    "description": "A GKS-G scholar's blog and a separate reapplication-strategy guide both recommend establishing correspondence with a specific professor or lab at the target institution before submitting, then referencing that connection in the study plan. Two independent sources support this, short of the 3-source bar for full recurring status, but it aligns with standard graduate-admissions practice and recurs across GKS-G prep resources generally.",
    "document_type_note": "n/a",
    "target_track": "gks_g",
    "activity_type": "other",
    "impact_area": "strengthens_study_plan",
    "source_platform": "blog",
    "source_url": "https://ewhagsis.home.blog/2022/03/25/study-at-ewha-gsis-as-a-gks-recipient/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Choosing R-GKS vs. General university track based on research readiness",
    "description": "The R-GKS (Research GKS) sub-program is described in official 2026 guidelines as a distinct graduate pathway covering a large share of university-track slots (480 scholars, 56 countries/regions). Advisory sources frame choosing between R-GKS, General, R&D, and Global Network tracks as a strategic decision that should follow from how developed an applicant's professor contact and research proposal already are. Single-sourced for the strategic framing; the track structure itself is from the official program page.",
    "target_track": "gks_g",
    "activity_type": "research_publication",
    "impact_area": "strengthens_study_plan",
    "source_platform": "blog",
    "source_url": "https://gksscholarship.com/gks-scholarship-2026-graduate-apply-now-global-korea-scholarship-2026/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Publishing a newspaper/opinion article on a subject relevant to the intended field",
    "description": "A GKS-G AI-track scholar described publishing a newspaper article on AI applications in a home-country sector, then using it as evidence of research capability and thought leadership in their SOP and interview prep. A single, detailed firsthand account.",
    "target_track": "gks_g",
    "activity_type": "research_publication",
    "impact_area": "strengthens_sop",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1ukr5o8/2026_gks_scholar_for_ai_sharing_my_experience/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Adding a small portfolio or research abstract to a GKS-U application",
    "description": "A GKS-U CS applicant described considering extra material (project screenshots, short descriptions, or a research-paper abstract) since guidelines don't specify how much supplementary material is welcome. A single account exploring an ambiguous gray area, not confirmation that extra material is reviewed or rewarded.",
    "target_track": "gks_u",
    "activity_type": "other",
    "impact_area": "interview_talking_point",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1ukrf63/can_i_include_extra_materials_like_a_portfolio_or/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Documented field-relevant work experience or entrepreneurship (GKS-G, career-switchers)",
    "description": "This now spans four independent accounts: a reddit thread on strengthening older/career-switcher applications, a study-plan guide from a confirmed GKS-G scholar recommending 2–3 work experiences tied explicitly to the research agenda, a reddit account from an AI scholar with six years in IT plus another who founded a fashion brand and homestay business, and an EssayForum draft from a GKS-G MBA applicant leveraging a career break and HR-management background. Genuinely well-corroborated for GKS-G specifically — the shared belief is that real work experience makes the 'why this degree, why now' narrative credible and gives interviewers concrete material.",
    "target_track": "gks_g",
    "activity_type": "internship_work_experience",
    "impact_area": "interview_talking_point",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1n2bbow/help_me_what_do_you_think_about_my_situation/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Translation/interpretation internship as major-relevant proof (language-track applicants)",
    "description": "A successful applicant described listing a Korean-interpreter internship as one of only a few key certificates submitted, chosen for direct relevance to a Korean Language Education major rather than breadth. Single account.",
    "target_track": "both",
    "activity_type": "internship_work_experience",
    "impact_area": "strengthens_sop",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1umqyn5/extra_certificates/",
    "confidence": "single_anecdote"
  },
  {
    "title": "University-Industry Cooperation (UIC) track for STEM-profile GKS-U applicants",
    "description": "The UIC sub-program is described in official 2026 guidelines and an Indian-applicant guide as a university-track-only, natural science/engineering-focused pathway notable for being open to applicants from all countries, not just NIIED-designated partner countries. Single-sourced advisory framing; the program's existence is confirmed by the official guideline, but the strategic advice to pursue it is from one guide.",
    "target_track": "gks_u",
    "activity_type": "internship_work_experience",
    "impact_area": "general_competitiveness",
    "source_platform": "blog",
    "source_url": "https://koreanlearners.com/blog/blog-10-2026-GKS-Undergraduate-Scholarship-Complete-Guide-for-Indian-Students.html",
    "confidence": "single_anecdote"
  },
  {
    "title": "Volunteering (local, remote, or skills-based) documented as evidence of sustained commitment",
    "description": "Multiple accounts describe volunteering — a GKS-U scholar's local volunteer certificates, a GKS-G applicant's Catchafire skills-based remote volunteering, and reddit threads describing UN Volunteers/KOICA-adjacent online programs used specifically when local opportunities were limited. Genuinely corroborated across independent reddit and blog accounts as a workaround for applicants without easy access to in-person opportunities, though no single source claims it was decisive.",
    "target_track": "both",
    "activity_type": "volunteering_community_service",
    "impact_area": "general_competitiveness",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1rbtfta/extracurriculars_certificates/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Volunteering or teaching in one's own subject area to bridge academics and community",
    "description": "A GKS-G AI scholar described volunteering to teach AI concepts, framing it in the SOP as a practical bridge between technical skill and community impact. A single detailed account.",
    "target_track": "gks_g",
    "activity_type": "volunteering_community_service",
    "impact_area": "strengthens_sop",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1ukr5o8/2026_gks_scholar_for_ai_sharing_my_experience/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Volunteering at a Korean Cultural Center (KCC) as a Korea-specific tie",
    "description": "Several commenters within one reddit 'what got you selected' AMA thread describe KCC volunteering (event support, media/editor roles) as a documentable Korea-connection usable in essays and interviews. This is several accounts within a single thread rather than 3 independently sourced discussions, so it's presented here as an emerging pattern rather than fully corroborated.",
    "target_track": "both",
    "activity_type": "volunteering_community_service",
    "impact_area": "interview_talking_point",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1uez4zr/gks_scholars_what_actually_got_you_selected_drop/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Leadership roles (club officer, TA/monitor, student government)",
    "description": "Accounts describe teaching-assistant/monitor roles valued for giving recommenders specific examples, and separately, high-school club leadership (sports, NCC, drama) described within one mentor's large AMA thread as helping applicants stand out. This spans a reddit thread and an advisory blog, but the AMA component aggregates many students through one narrator rather than independent voices, so it's kept at single_anecdote/emerging rather than fully corroborated.",
    "target_track": "both",
    "activity_type": "leadership_role",
    "impact_area": "strengthens_recommendation",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1qndcqz/i_helped_200_students_win_gks_ask_me_anything/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Winning a Korean-language speech contest or KSI-affiliated competition",
    "description": "An applicant for a Korea/language-related major described winning a Korean speech contest via a King Sejong Institute pathway as a standout, documentable achievement and interview talking point beyond generic 'interest in Korea' framing. Single account.",
    "target_track": "both",
    "activity_type": "academic_competition",
    "impact_area": "general_competitiveness",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1umqyn5/extra_certificates/",
    "confidence": "single_anecdote"
  },
  {
    "title": "National-level skills competition wins (GKS-U associate/vocational track only)",
    "description": "A GKS-U strategy guide notes that for the associate-degree (vocational) track specifically, winning at or above a national-level skills competition is described as an explicit preference criterion in the 2026 guidelines. Highly track-specific — does not apply to standard undergraduate or graduate applicants. Single-sourced; worth confirming against the current guideline text.",
    "target_track": "gks_u",
    "activity_type": "academic_competition",
    "impact_area": "scoring_points_niied",
    "source_platform": "blog",
    "source_url": "https://www.haniseoul.com/blogs/gks-u-application-strategy",
    "confidence": "single_anecdote"
  },
  {
    "title": "Taking online workshops/certifications (Coursera, K-MOOC) when local options are limited",
    "description": "Applicants describe using online workshops and certifications — including AI/CS-specific Coursera and K-MOOC courses paired with GitHub project work — as a way to build a documentable track record when local extracurricular options were limited, particularly for STEM-track applicants. This spans two reddit threads; several accounts note this carries less weight than TOPIK or hands-on experience.",
    "target_track": "both",
    "activity_type": "online_course_certification",
    "impact_area": "general_competitiveness",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1pzr5sv/extracurriculars_and_gks/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Attending Korean cultural events, festivals, or exchanges before applying",
    "description": "A GKS-U personal statement guide advises referencing prior attendance at Korean cultural festivals, film screenings, or exchange programs as concrete material for the 'Why Korea' section, rather than generic statements about Korea's development. Single-sourced advisory guidance.",
    "target_track": "both",
    "activity_type": "cultural_engagement_korea",
    "impact_area": "strengthens_sop",
    "source_platform": "blog",
    "source_url": "https://scholarsacademie.com/blog/gks/gks-personal-statement-structure/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Taking Korean culture classes (taekwondo, hansik/cooking) as documentable engagement",
    "description": "One reddit account within the 'what got you selected' AMA thread described taking free Korean culture classes alongside other Korea-tied activities, framed as creating real experiences to discuss rather than treating cultural interest as vague. Single account.",
    "target_track": "both",
    "activity_type": "cultural_engagement_korea",
    "impact_area": "interview_talking_point",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1uez4zr/gks_scholars_what_actually_got_you_selected_drop/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Documenting a personal trip to Korea with photos as supplementary material",
    "description": "A GKS-G AI scholar (embassy track) described a personal trip to Korea, documented with photos, framed in the SOP and study plan as deepening understanding of the academic environment and providing interview material tied to specific observations. Single account.",
    "target_track": "both",
    "activity_type": "cultural_engagement_korea",
    "impact_area": "interview_talking_point",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1ukr5o8/2026_gks_scholar_for_ai_sharing_my_experience/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Referencing prior stay, study, or work experience in Korea in the GKS-G personal statement",
    "description": "An EssayForum thread shows a real GKS-G master's applicant (International Relations) referencing prior work, stay, and university-life experience in Korea as a key motivation narrative element, with reviewer feedback pushing for more specificity. A genuine firsthand draft account, though only one so far.",
    "target_track": "gks_g",
    "activity_type": "cultural_engagement_korea",
    "impact_area": "strengthens_sop",
    "source_platform": "forum",
    "source_url": "https://essayforum.com/scholarship/statement-gks-international-95751/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Fine arts, music, or sports extracurriculars and portfolio submission (field-specific)",
    "description": "The official GKS scholarship advisory site lists sports, music, community service, and leadership as extracurricular assets, and separately, official NIIED guidelines plus an SNU exchange guide confirm that fine arts/music/sports applicants may need to submit performance portfolios or recordings as supplementary university-level documents. This is corroborated across the official program site, official guideline text, and an independent university source — a genuinely strong, field-specific finding.",
    "target_track": "both",
    "activity_type": "other",
    "impact_area": "general_competitiveness",
    "source_platform": "blog",
    "source_url": "https://gksscholarship.com/gks-scholarship-tips/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Submitting fewer, highly major-relevant certificates rather than many generic ones",
    "description": "Multiple successful-applicant comments and a scholar blog stress relevance over quantity — a handful of language- and major-related certificates, with essays used to contextualize the rest. Spans two independent source types (reddit + blog), short of the 3-source bar for full corroboration.",
    "target_track": "both",
    "activity_type": "other",
    "impact_area": "strengthens_sop",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1umqyn5/extra_certificates/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Framing GKS as a bilateral bridge role between Korea and home country",
    "description": "Guides aimed at GKS-U and GKS-G applicants alike, plus a firsthand EssayForum draft from an International Relations GKS-G applicant citing specific diplomatic-tie language, describe framing post-graduation plans as a concrete bridge role between Korea and one's home country. The general narrative-framing guidance and the field-specific firsthand draft are two distinct sources, kept together here as a related theme rather than fully independent corroboration.",
    "target_track": "both",
    "activity_type": "other",
    "impact_area": "strengthens_sop",
    "source_platform": "blog",
    "source_url": "https://www.globaladmissions.com/scholarship/gks-scholarship",
    "confidence": "single_anecdote"
  },
  {
    "title": "Crafting an authentic adversity/resilience narrative",
    "description": "Advisory guides describe applicants from challenging socioeconomic backgrounds who authentically narrate how they independently overcame difficulty as favorably received, given GKS's stated development mission. This is narrative framing rather than a discrete activity, and currently rests on advisory-blog claims rather than firsthand confirmation.",
    "target_track": "both",
    "activity_type": "other",
    "impact_area": "strengthens_sop",
    "source_platform": "blog",
    "source_url": "https://www.haniseoul.com/blogs/gks-u-application-strategy",
    "confidence": "single_anecdote"
  },
  {
    "title": "STEM major bonus in GKS-U document screening (~5%)",
    "description": "A 2026 GKS-U strategy guide describes an explicit STEM preference worth roughly 5% of the document-screening score, on top of the TOPIK bonus, together said to exceed 15% of total score. This is a single-sourced claim about a specific percentage that changes by cycle — verify against the current official guideline before treating as settled fact. Applicants outside STEM are not eligible for this specific bonus per this source.",
    "target_track": "gks_u",
    "activity_type": "other",
    "impact_area": "scoring_points_niied",
    "source_platform": "blog",
    "source_url": "https://www.haniseoul.com/blogs/gks-u-application-strategy",
    "confidence": "single_anecdote"
  },
  {
    "title": "Type B (regional) university choice compounding with STEM preference",
    "description": "2026 NIIED guidelines reportedly list natural science/engineering applicants to a regional (Type B) university as a named preference category, which one guide describes as compounding with the general STEM bonus since Type B universities also see lower overall competition. Single-sourced; the underlying Type B mandatory-choice rule is independently confirmed elsewhere (see the mistakes database), but this specific compounding-preference framing rests on one source.",
    "target_track": "both",
    "activity_type": "other",
    "impact_area": "scoring_points_niied",
    "source_platform": "blog",
    "source_url": "https://www.topikguide.com/global-korea-scholarship-gks-graduate/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Low-income/underprivileged background as a named NIIED preference category",
    "description": "2026 NIIED guidelines reportedly list applicants from low-income families or underprivileged backgrounds as a distinct, formally recognized preference category, separate from general resilience-narrative framing. Applicants who qualify are advised to be prepared to document this status if asked. Single-sourced — worth verifying directly against the current-cycle guideline given the sensitivity of the category.",
    "target_track": "both",
    "activity_type": "other",
    "impact_area": "scoring_points_niied",
    "source_platform": "blog",
    "source_url": "https://www.topikguide.com/global-korea-scholarship-gks-graduate/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Korean War veteran descendant status as a documented 5% scoring preference",
    "description": "A GyanDhan overview, which the source states is corroborated by a separate Yocket guide, describes direct descendants of Korean War veterans who served as foreign military personnel receiving an additional 5% of total evaluation points. A narrow, specifically identified population; applicants in this category are advised to proactively document lineage. Kept at single_anecdote since only one URL was independently retrieved, despite the claimed second corroborating source.",
    "target_track": "both",
    "activity_type": "other",
    "impact_area": "scoring_points_niied",
    "source_platform": "blog",
    "source_url": "https://www.gyandhan.com/scholarships/gks-scholarship",
    "confidence": "single_anecdote"
  },
  {
    "title": "Majoring in a field NIIED explicitly names as preferred (STEM, or humanities tied to global cooperation)",
    "description": "The official NIIED program description reportedly names science/engineering fields tied to industry, and humanities/social-science fields tied to 'enhancing global cooperation,' as preferred categories beyond generic STEM framing. One guide advises humanities applicants specifically to frame their major in global-cooperation or bilateral terms to align with this stated preference. Single-sourced advisory framing.",
    "target_track": "gks_g",
    "activity_type": "other",
    "impact_area": "strengthens_study_plan",
    "source_platform": "blog",
    "source_url": "https://kowork.kr/en/blog/gks-scholarship-guide-en",
    "confidence": "single_anecdote"
  },
  {
    "title": "Preparing Korea-specific interview answers on bilateral relations (embassy track)",
    "description": "A guide for Indian applicants notes embassy-track interviews typically probe motivation, study plan, and views on Korea-home country bilateral relations, advising applicants to rehearse specific answers rather than generic ones. Single-sourced, though it aligns with the interview-preparation patterns already documented in the mistakes database.",
    "target_track": "both",
    "activity_type": "other",
    "impact_area": "interview_talking_point",
    "source_platform": "blog",
    "source_url": "https://www.indokoreanexpress.com/blog/2",
    "confidence": "single_anecdote"
  },
  {
    "title": "Avoiding K-pop/K-drama framing as the primary stated motivation",
    "description": "A reddit discussion on rejection and reapplying suggests leaning heavily on K-pop in a personal statement can read as tourism/fandom rather than academic intent, advising applicants to redirect that interest toward study or professional goals instead. This directly echoes the generic-SOP findings already documented in the mistakes database — included here as the extracurricular-side companion advice (channel the interest into a real activity, don't just state it).",
    "target_track": "both",
    "activity_type": "other",
    "impact_area": "strengthens_sop",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1t1185d/i_got_rejected_profile_improvement/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Joining GKS/KGSP applicant Facebook groups and contacting past awardees",
    "description": "A firsthand blog by a confirmed GKS awardee describes joining the 'KGSP Global Applicant' Facebook group and directly messaging past awardees from their country for advice before applying, crediting this peer network as a major source of practical guidance. A meta-strategy (community research) rather than a standalone activity, but specific and actionable — and notably the exact gap a platform like GKS Connect is designed to fill.",
    "target_track": "both",
    "activity_type": "other",
    "impact_area": "general_competitiveness",
    "source_platform": "blog",
    "source_url": "https://www.tumblr.com/bonaintan/625473194547167232/a-journey-to-kgspgks-study-plan",
    "confidence": "single_anecdote"
  }
]
```

## Changelog / what was fixed

**Removed entirely (unverifiable):** "K-influencer content creation" — `source_url: "not linkable"` on a platform (YouTube) with a named-sounding individual, plus the raw text still contained leftover `<!--citation:N-->` markup, meaning something in the generation pipeline referenced a citation that was never actually attached. This combination (unlinkable + orphaned citation marker) means the claim can't be verified and shouldn't be published, even hedged.

**Flagged and downgraded (suspected content-farm sources):** Three entries citing `ftp.bills.com.au`, `prototype.jacksonholetraveler.com`, and `img.krmangalam.edu.in` shared near-identical article titles and trailing numeric IDs (`1767647857`, `1767647855`) across unrelated domain types (an FTP subdomain, a personal travel blog, a university's image server). This is a textbook sign of spun/duplicated spam content, not three genuine independent GKS advisory sources. These were merged where the underlying claim was uncontroversial (e.g. adversity narrative, choosing research-focused recommenders) but explicitly flagged as low-trust single sources rather than counted toward recurring-theme status.

**Confidence recalibrated:**
- *Upgraded* to `recurring_theme` where merging produced real 3+ independent sources: TOPIK 3+ scoring bonus, research/publication anchoring the GKS-G study plan, career/internship experience for GKS-G, volunteering as a documentable-commitment workaround, and the fine arts/music/sports portfolio requirement (backed by the official GKS site, official guideline text, and an independent university source).
- *Downgraded* where a batch had claimed `recurring_theme` off one reddit AMA thread with multiple commenters (not independent sources) — e.g. high-school club leadership, KCC volunteering, Korean-culture-class attendance.

**Recategorized:** MUN/drama club participation had been filed under `academic_competition` — moved to `other`, since it isn't a competition.

**Deduplicated:** The TOPIK-related claims were scattered across 6 near-duplicate entries in the raw batch (application-stage bonus, post-enrollment stipend, language-year exemption, general "study hard" behavior, and English-test bonus) — consolidated into 5 clearly distinct mechanisms so they don't read as the same fact repeated.

## Notes for you before this goes live
- The **NIIED official-rule claims** (STEM bonus %, Type B compounding, veteran-descendant 5%, low-income category) are the highest-value entries here if true, but each currently rests on one advisory blog rather than the official PDF directly. Given how confidently they're stated and how much weight an applicant might put on them, I'd treat these as "verify against this cycle's actual guideline PDF before publishing" rather than ship as-is.
- The **low-income/underprivileged preference category** touches a sensitive personal attribute — worth thinking about how GKS Connect frames this in the UI (e.g., informational note rather than something that could read as pressuring applicants to over-disclose).
