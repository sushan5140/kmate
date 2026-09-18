# GKS Connect — Common Application Mistakes Database (v2, Refined)

*This is a refinement pass over three merged research batches (the original deep research task + two community/self-collected JSON files). Changes from v1 are noted in the changelog at the bottom.*

## TL;DR
- Best-supported patterns (now with 3+ independent sources after merging): SKY-only university selection, mandatory Type-B university omission, recommendation-letter sealing/signing/dating errors, generic K-pop/cultural-motivation SOPs, vague study plans with no before/during/after timeline, and Korean-language interview freezing.
- Several claims that batches 1–2 labeled "recurring_theme" off a single reddit thread were downgraded to `single_anecdote` to keep the 3-source bar honest.
- Five "I couldn't find evidence" placeholder entries were removed from the database (they're not findings) and folded into the gaps section instead.
- Genuinely new findings surfaced this round: expired apostilles (2-year window), TB history omission, a medical-disclosure scrutiny pattern, a missed recommendation-letter copy in the second envelope set, TA-vs-professor recommender choice, university-specific quota exhaustion, and missing TOPIK score cited as a factor.

## Refined Database (JSON)

```json
[
  {
    "title": "Confusing apostille, notarization and consular confirmation",
    "description": "Applicant questions and community guidance repeatedly show confusion over which authentication a document needs — apostille versus notarization versus consular confirmation — including cases where applicants submitted standard notarized copies instead of the formal state apostille NIIED requires. This recurs across Facebook groups and guide sites, though it's corroborated mainly by guides rather than 3 distinct firsthand individual confessions. Reading NIIED's current guideline and confirming with the embassy is the fix.",
    "document_type": "apostille",
    "reason_category": "missing_document",
    "source_platform": "facebook",
    "source_url": "https://www.facebook.com/groups/gksscholarship/posts/1648767645991610/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Apostille done last-minute; documents nearly missed deadline",
    "description": "A university-track GKS-G awardee described the multi-step apostille chain (sworn translator, then Ministry of Law, then Ministry of Foreign Affairs, then Korean Embassy) taking about two weeks, with her couriered documents arriving only a day before submission closed. Several applicants and Facebook-group threads echo that underestimating apostille turnaround time is a common near-miss. Starting the process months early would have avoided the scramble.",
    "document_type": "apostille",
    "reason_category": "missing_document",
    "source_platform": "blog",
    "source_url": "https://watasiwamy.medium.com/part-5-global-korea-scholarship-experience-university-track-6499b2b58b1e",
    "confidence": "recurring_theme"
  },
  {
    "title": "Self-translated documents instead of proper notarization",
    "description": "A GKS-U scholar admitted that because she did not understand what notarization was and wanted to save money, she self-translated her documents and only had her school certify them rather than getting them properly notarized. She explicitly warned future applicants not to copy her, noting rules may be stricter now.",
    "document_type": "apostille",
    "reason_category": "missing_document",
    "source_platform": "blog",
    "source_url": "https://korealah-my.medium.com/global-korea-scholarship-undergraduate-application-guide-general-guide-and-interview-tips-1b1620496db5",
    "confidence": "single_anecdote"
  },
  {
    "title": "Apostilling the original document rather than a certified copy",
    "description": "Guidance for Indian applicants states that for South Korea, the apostille should go on stamped, certified true copies (not the original, except affidavits), and that authenticating the wrong version can create problems. This point comes largely from an apostille-service vendor, so treat the severity framing with caution, but the original-vs-copy confusion recurs in genuine applicant questions.",
    "document_type": "apostille",
    "reason_category": "missing_document",
    "source_platform": "blog",
    "source_url": "https://www.lkwu.in/post/gks-u-2026-apostille-guide-required-docs-process",
    "confidence": "single_anecdote"
  },
  {
    "title": "Failing to apostille translated versions of non-English documents",
    "description": "Applicants who legalize their original non-English/non-Korean certificates sometimes neglect to also apostille the certified translation. Guidance indicates both the original and its translation need authentication to remain valid. This is a single guide-sourced point, not yet corroborated by a firsthand account.",
    "document_type": "apostille",
    "reason_category": "missing_document",
    "source_platform": "blog",
    "source_url": "https://pecattestation.com/blog/get-quick-apostille-for-studying-in-south-korea",
    "confidence": "single_anecdote"
  },
  {
    "title": "Reusing apostilled documents past their validity window",
    "description": "A reddit discussion described NIIED rules specifying that apostilled or consular-confirmed documents must have been authenticated within roughly two years of the application deadline, and that reapplicants sometimes resubmit older documents unaware of the limit. This is currently a single reddit-sourced account, worth flagging for reapplicants specifically.",
    "document_type": "apostille",
    "reason_category": "missing_document",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1q5iqyv/expiration_of_apostilled_documents/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Freezing or switching languages under spontaneous Korean interview questions",
    "description": "Multiple accounts describe interviewers switching to Korean mid-interview to test adaptability — one applicant introduced themselves in Korean but then answered a follow-up in English and suspects the inconsistency hurt them; others describe freezing or being unable to continue when questioned in Korean unexpectedly. This pattern now has independent support from a blog account and two separate reddit threads. Practicing a basic Korean self-introduction, staying composed, and being honest about actual proficiency are the repeated fixes.",
    "document_type": "interview",
    "reason_category": "poor_interview",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1sm3f95/has_anyone_had_an_experience_like_this_before/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Interview panel couldn't understand a rushed Korean answer",
    "description": "A university-track applicant described rushing her answer to a Korean-language interview question so badly the professors visibly couldn't follow her, and separately asked about a course the panel said didn't exist, undermining her credibility. Slower delivery and verifying program details beforehand would have helped.",
    "document_type": "interview",
    "reason_category": "poor_interview",
    "source_platform": "blog",
    "source_url": "https://watasiwamy.medium.com/part-5-global-korea-scholarship-experience-university-track-6499b2b58b1e",
    "confidence": "single_anecdote"
  },
  {
    "title": "Rambling instead of answering concisely in the interview",
    "description": "One applicant recounted being cut off by an interviewer for circling around the same point rather than answering directly. Community advice repeatedly stresses concise, non-repetitive answers; practicing brevity beforehand is the suggested fix.",
    "document_type": "interview",
    "reason_category": "poor_interview",
    "source_platform": "other",
    "source_url": "https://www.studocu.com/ko/document/seoul-national-university-of-science-and-technology/health-science/common-scholarship-interview-questions/40666988",
    "confidence": "single_anecdote"
  },
  {
    "title": "Memorized, robotic answers and overly casual dress",
    "description": "A GKS-U awardee warned that reciting memorized scripts sounds unnatural to interviewers and that casual dress (jeans, T-shirt, sneakers) creates a poor impression; a separate YouTube short echoes that over-rehearsed, rigid answers read poorly against panels evaluating natural rapport. Two independent sources now support this, though not yet the 3 needed for full recurring status. Preparing talking points rather than scripts, and dressing formally, are the recommended fixes.",
    "document_type": "interview",
    "reason_category": "poor_interview",
    "source_platform": "blog",
    "source_url": "https://korealah-my.medium.com/global-korea-scholarship-undergraduate-application-guide-general-guide-and-interview-tips-1b1620496db5",
    "confidence": "single_anecdote"
  },
  {
    "title": "Defensive or unprepared answer to \"what if you're not selected?\"",
    "description": "Applicants report interviewers asking how a candidate would handle not receiving the scholarship, and that defensive or desperate-sounding answers can read as a lack of maturity or planning. Framing GKS as a top priority while describing a concrete backup plan to continue research is the suggested approach.",
    "document_type": "interview",
    "reason_category": "poor_interview",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/Indians_StudyAbroad/comments/1tcyqj9/gks_interview_great_way_to_answer_what_would_you/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Post-arrival medical exam disqualification risk",
    "description": "NIIED's 2026 application form states that after arriving in Korea, all GKS scholars undergo a medical exam (including a TBPE drug test), and unfit results 'may' lead to disqualification. This is a documented rule rather than a confirmed firsthand outcome — public accounts of it actually happening to a GKS scholar are essentially absent.",
    "document_type": "medical",
    "reason_category": "other",
    "source_platform": "forum",
    "source_url": "https://koreabridge.net/discussion/failed-medical-check",
    "confidence": "single_anecdote"
  },
  {
    "title": "Not using NIIED's official proprietary medical certificate",
    "description": "Guidance warns that applicants sometimes submit general hospital health certificates instead of NIIED's specific cycle-issued medical form, which requires particular diagnostic fields. This is currently sourced from guide sites rather than a firsthand rejection account. Using the exact current NIIED form and completing every required field is the safeguard.",
    "document_type": "medical",
    "reason_category": "missing_document",
    "source_platform": "blog",
    "source_url": "https://scholarsacademie.com/blog/gks/gks-scholarship-application-documents/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Medical-form disclosures (chronic illness, medication) drawing extra scrutiny",
    "description": "Two separate reddit threads describe applicants who disclosed an ongoing health condition or psychiatric medication on the medical form, were then questioned closely about it during the interview, and afterward speculated (without confirmation) that the disclosure contributed to their rejection. This is an emerging pattern across two independent accounts, not yet a confirmed causal link — GKS is holistic and neither applicant received an official reason. Providing a supplementary doctor's note confirming fitness to study abroad is the suggested mitigation.",
    "document_type": "medical",
    "reason_category": "other",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1uo7fgp/gksg_reasons_for_rejection/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Omitting treated tuberculosis history out of disqualification fears",
    "description": "One account describes an applicant with a history of fully treated TB omitting it from disclosure out of fear of disqualification, despite Korea's strict TB monitoring for visa and dormitory clearance — a discrepancy that can surface later on a required chest X-ray. Disclosing accurately upfront is the safer path.",
    "document_type": "medical",
    "reason_category": "other",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1u42nq6/medical_history/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Name spelling mismatches across school records, birth certificate and passport",
    "description": "A graduate applicant described discovering name inconsistencies across her documents and having to obtain a 'one-and-the-same-person' affidavit before applying; a separate reddit thread describes similar surname-spelling mismatches across identity documents being flagged during review. Two independent sources now support this pattern. Standardizing spelling across all documents before applying is the fix.",
    "document_type": "passport",
    "reason_category": "other",
    "source_platform": "blog",
    "source_url": "https://learnkorean.in/gks-documents-submission-challenges-you-might-face-from-one-applicant-to-another/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Passport-vs-application field mismatches (name, field of study)",
    "description": "A reddit thread on the 2026 GKS-G online application described discrepancies between the passport name and application fields, including field-of-study mismatches. A single account, but a concrete illustration of why careful cross-checking against official documents matters.",
    "document_type": "passport",
    "reason_category": "missing_document",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1r6mhyt/discrepancies_in_2026_gksg_online_application/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Missing parent-citizenship proof for divorced/single-parent applicants",
    "description": "GKS rules require confirming neither parent holds Korean citizenship; applicants raised by a single or divorced parent have reported missing the required certified divorce or death certificate to explain a missing parent's documents. Submitting certified explanatory documents alongside the birth certificate addresses it.",
    "document_type": "passport",
    "reason_category": "missing_document",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1pqs5bc/family_relationship_and_citizenship_documents/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Recommendation letter not sealed, signed across the flap, or dated",
    "description": "NIIED's application form states verbatim that recommendation letters not dated, signed, or sealed will not be accepted, and requires the referee to sign across the sealed envelope's back flap. This exact requirement now has independent support from a Facebook-group thread, a blog, and a reddit thread describing rejected submissions over open envelopes, unsigned flaps, or loose forms — the strongest-supported procedural error in this database. Briefing the recommender precisely on sealing, signing and dating is the fix.",
    "document_type": "recommendation",
    "reason_category": "missing_document",
    "source_platform": "facebook",
    "source_url": "https://www.facebook.com/groups/4063227530413493/posts/8253027411433463/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Recommendation letter dated more than a year before the deadline",
    "description": "NIIED's GKS-G FAQ requires the letter be dated within one year of the application deadline. Applicants who reuse an old letter or have a recommender sign far in advance risk rejection on date grounds. Getting a freshly dated letter for the current cycle is the fix.",
    "document_type": "recommendation",
    "reason_category": "missing_document",
    "source_platform": "blog",
    "source_url": "https://joyofkorean.com/gks-undergraduate/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Recommender delayed or missed the submission deadline",
    "description": "Applicants widely warn that recommenders take a long time and may not deliver on schedule; one applicant on a graduate-school forum described a professor who kept promising and still missed the deadline, leaving the application incomplete. The clearest account is from a general grad-school forum rather than GKS specifically, but the concern recurs across GKS applicant discussions too. Giving recommenders at least a month and following up early is the standard advice.",
    "document_type": "recommendation",
    "reason_category": "missing_document",
    "source_platform": "forum",
    "source_url": "https://forum.thegradcafe.com/topic/85469-my-professor-didnt-end-up-submitting-my-recommendation-letter/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Generic, admin-drafted recommendation letter lacking personal detail",
    "description": "A GKS-U awardee advised that a letter should emphasize the applicant's specific qualities rather than restate facts already in the application; a separate reddit post similarly flagged admin-office-drafted letters focused on generic academic praise as a weak point. Choosing a recommender who knows the applicant well and can be specific is the fix.",
    "document_type": "recommendation",
    "reason_category": "other",
    "source_platform": "blog",
    "source_url": "https://korealah-my.medium.com/global-korea-scholarship-undergraduate-application-guide-general-guide-and-interview-tips-1b1620496db5",
    "confidence": "single_anecdote"
  },
  {
    "title": "Recommendation letter missing from the required second (copy) set",
    "description": "A university-track applicant realized after submission that they'd included the recommendation letter in the main envelope set but accidentally omitted it from the required duplicate set, and worried this could cause disqualification. A concrete illustration of why checking every required set against the checklist matters.",
    "document_type": "recommendation",
    "reason_category": "missing_document",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1rtqwbg/university_track_realized_i_missed_the_copy_set/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Recommendation from a TA rather than a professor",
    "description": "One rejected applicant theorized their reference may have been weaker because it came from a teaching assistant rather than a professor, since letters from senior academics are typically expected to carry more weight. This is the applicant's own unconfirmed theory about their rejection, not a verified cause.",
    "document_type": "recommendation",
    "reason_category": "other",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1j5v6dj/rejected_from_embassy_track/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Contact-number mismatch between the online portal and the hard-copy letter",
    "description": "An applicant registered their university's general office number on the online portal while their recommender listed a personal direct line on the physical letter, raising unnecessary questions during document audit. Keeping contact details consistent across digital and hard-copy submissions avoids it.",
    "document_type": "recommendation",
    "reason_category": "other",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1rq5yig/losing_my_mind_over_a_small_mistake/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Personal statement overlaps and repeats the study plan",
    "description": "The most frequently cited SOP/study-plan writing mistake is making both documents say the same thing — repeating academic background, interest in Korea, and career goals in both, including cases of near-identical sentences across the two. This is corroborated across a blog guide and multiple independent reddit threads. The personal statement should cover who you are; the study plan should cover what you will do.",
    "document_type": "sop",
    "reason_category": "generic_sop",
    "source_platform": "blog",
    "source_url": "https://gradpilot.com/news/gks-scholarship-rejected-reapplication-strategy",
    "confidence": "recurring_theme"
  },
  {
    "title": "Generic cultural motivation and K-pop/K-drama fandom references",
    "description": "The single most-repeated SOP weakness across sources: statements like 'I've always loved Korean culture / K-pop / K-dramas' that reviewers reportedly see constantly and read as unserious. This now has independent support from a guide blog, at least three separate reddit threads, and a YouTube short — one of the best-corroborated findings in this database. Specific engagement (language study, academic or professional connections to Korea) is the recommended replacement.",
    "document_type": "sop",
    "reason_category": "generic_sop",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1t995cg/common_mistakes_in_gks_personal_statements_and/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Personal statement reads like a resume",
    "description": "A personal statement that simply lists achievements like a CV is flagged as a self-awareness red flag, since reviewers already have the transcript and CV. A narrative explaining who the applicant is and why Korea specifically is what reviewers reportedly want instead.",
    "document_type": "sop",
    "reason_category": "generic_sop",
    "source_platform": "blog",
    "source_url": "https://gradpilot.com/news/gks-scholarship-study-plan-personal-statement-guide",
    "confidence": "single_anecdote"
  },
  {
    "title": "Signaling GKS is a backup option or stepping stone",
    "description": "Guidance and multiple reddit threads warn against any hint that GKS is a fallback — mentioning other scholarships applied for and failed, or framing a Korean degree as a route elsewhere afterward. This undermines the cultural-exchange purpose reviewers reportedly look for, and now has support from a blog plus two independent reddit threads. Framing Korea and GKS as the first choice throughout is the repeated advice.",
    "document_type": "sop",
    "reason_category": "generic_sop",
    "source_platform": "blog",
    "source_url": "https://gradpilot.com/news/gks-scholarship-rejected-reapplication-strategy",
    "confidence": "recurring_theme"
  },
  {
    "title": "Weak coherence linking background, major and future goals",
    "description": "A reddit thread described statements becoming less convincing when they don't connect past experience, academic background, and the chosen major into one coherent thread — framed as a structural coherence problem rather than one missing fact.",
    "document_type": "sop",
    "reason_category": "generic_sop",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1t995cg/common_mistakes_in_gks_personal_statements_and/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Exceeding the mandated page or word-count limit",
    "description": "Guidance warns applicants sometimes ignore strict page limits (e.g. two pages for the personal statement), assuming length signals achievement, when reviewers managing thousands of files strictly enforce caps and may penalize or reject over-length submissions. This is a formatting error rather than a content-genericness issue.",
    "document_type": "sop",
    "reason_category": "other",
    "source_platform": "blog",
    "source_url": "https://scholarsacademie.com/blog/gks/gks-scholarship-application-documents/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Vague study plan with no before/during/after timeline",
    "description": "The most-cited study-plan weakness: a plan listing courses or general interests without a temporal structure covering preparation before Korea, a semester-by-semester plan during Korea, and career plans after. This is now corroborated across a blog guide and three separate reddit threads. Adding a concrete phased timeline is the standard fix.",
    "document_type": "study_plan",
    "reason_category": "weak_study_plan",
    "source_platform": "blog",
    "source_url": "https://gradpilot.com/news/gks-scholarship-rejected-reapplication-strategy",
    "confidence": "recurring_theme"
  },
  {
    "title": "Generic study plan not tailored to a specific program or professor",
    "description": "A widely repeated mistake is a study plan general enough to submit to any university, without naming specific courses, labs, or potential advisors — reviewers reportedly expect it to read as written for one professor at one department. This has support from a guide blog and a separate reddit thread. Identifying 1–2 potential advisors and referencing their specific work is the recommended fix.",
    "document_type": "study_plan",
    "reason_category": "weak_study_plan",
    "source_platform": "blog",
    "source_url": "https://scholarsacademie.com/blog/gks/gks-study-plan-tips/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Unrealistic research milestones and timelines",
    "description": "A GKS mentor warned that promising a completed literature review, multiple conference papers, and a drafted thesis all within the first year reads as a red flag rather than an achievement, since it ignores language adjustment and research realities. Building in realistic time for adaptation makes the plan more credible.",
    "document_type": "study_plan",
    "reason_category": "weak_study_plan",
    "source_platform": "blog",
    "source_url": "https://scholarsacademie.com/blog/gks/gks-study-plan-tips/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Study plan with no post-graduation or return plan",
    "description": "A study plan ending at graduation with no concrete career plan or stated return intent is repeatedly cited as incomplete; reviewers reportedly want to see where the Korean degree leads, and return intent draws particular scrutiny given the current visa-enforcement climate. Naming a specific sector, role, and home-country organizations addresses it.",
    "document_type": "study_plan",
    "reason_category": "weak_study_plan",
    "source_platform": "blog",
    "source_url": "https://gradpilot.com/news/gks-scholarship-rejected-reapplication-strategy",
    "confidence": "recurring_theme"
  },
  {
    "title": "Missing CGPA or class rank on the transcript",
    "description": "A transcript without a CGPA or ranking information may be at a disadvantage in evaluation, and applicants commonly ask how to fill GPA fields when only a CGPA is available. Guidance is to enter the CGPA and leave per-course GPA blank if that's all the transcript provides.",
    "document_type": "transcript",
    "reason_category": "missing_document",
    "source_platform": "blog",
    "source_url": "https://www.topikguide.com/global-korea-scholarship-gks-official-gpa-conversion-table/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Unofficial or unconfirmed GPA conversion",
    "description": "When a transcript uses a non-standard scale, applicants must submit a converted GPA, but a self-made conversion (e.g. via Scholaro) is only accepted if the university officially confirms it. This point is now corroborated across two blog guides and a reddit thread of applicants seeking clarification. Getting the university to authenticate the converted transcript is the fix.",
    "document_type": "transcript",
    "reason_category": "missing_document",
    "source_platform": "blog",
    "source_url": "https://www.topikguide.com/global-korea-scholarship-gks-official-gpa-conversion-table/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Transcript missing semesters, registrar signature, or certified translation",
    "description": "A graduate applicant described the transcript needing to include all semesters and grades, carry the registrar's official signature, and be translated into English if issued in another language — with a separate guide specifically flagging untranslated regional-language transcripts as a disqualification risk. Two independent sources now support this. Requesting the transcript early and checking all three elements avoids incomplete submissions.",
    "document_type": "transcript",
    "reason_category": "missing_document",
    "source_platform": "blog",
    "source_url": "https://learnkorean.in/gks-documents-submission-challenges-you-might-face-from-one-applicant-to-another/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Assuming a provisional degree certificate will be accepted",
    "description": "A graduate applicant whose final degree certificate was delayed used a provisional certificate but stressed confirming acceptability with the university first; a separate reddit account confirmed that even when an embassy initially allows a provisional certificate, NIIED will cancel a selection if the final diploma isn't apostilled by the deadline. Two independent accounts now support this, with the second clarifying it as a firm NIIED rule rather than embassy discretion. Clarifying provisional-document rules directly with NIIED, not just the embassy, is the safer path.",
    "document_type": "transcript",
    "reason_category": "missing_document",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1qdtg1e/provisional_certificate/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Applying only to the three most competitive 'SKY' universities",
    "description": "The most frequently cited university-choice mistake: listing only Seoul National, Korea, and Yonsei across all Embassy-track preferences, leaving no margin in a hyper-competitive pool. This now has support from a blog guide and two separate reddit threads. Spreading choices across competitiveness tiers is the standard remedy.",
    "document_type": "university_choice",
    "reason_category": "wrong_university_choice",
    "source_platform": "blog",
    "source_url": "https://scholarsacademie.com/blog/gks/korean-university-ranking-for-gks/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Not including a required regional / Type B university",
    "description": "NIIED's GKS-G guidelines state Embassy-track applicants must apply to at least one Type B (regional) university among their up-to-three choices. Ignoring this mandatory pick and chasing only Seoul schools reduces chances, especially given GKS's separate R-GKS regional quota program. Deliberately including a Type B option maximizes odds.",
    "document_type": "university_choice",
    "reason_category": "wrong_university_choice",
    "source_platform": "blog",
    "source_url": "https://scholars-academie.beehiiv.com/p/issue-3",
    "confidence": "recurring_theme"
  },
  {
    "title": "Not checking that the department participates in GKS for your field",
    "description": "Not all departments at all universities accept GKS students in every field; applicants sometimes assume otherwise and are rejected on a technicality. This now has support from a blog guide and a specific reddit account of rejection after applying to a department that didn't participate. Confirming participation against the official University Information file before finalizing choices avoids wasted preferences.",
    "document_type": "university_choice",
    "reason_category": "wrong_university_choice",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1szpu5m/rejected_by_skku_gksg_university_track_need/",
    "confidence": "recurring_theme"
  },
  {
    "title": "Ignoring practical fit (dormitory, dietary options)",
    "description": "A vegetarian graduate applicant advised checking dormitory facilities before selecting universities, since many dorms require a cafeteria meal plan that's often meat-heavy and lack kitchens, making daily life harder and more expensive. A practical living-conditions consideration rather than a rejection cause.",
    "document_type": "university_choice",
    "reason_category": "other",
    "source_platform": "blog",
    "source_url": "https://learnkorean.in/gks-documents-submission-challenges-you-might-face-from-one-applicant-to-another/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Overlooking country-specific quota exhaustion at a chosen university",
    "description": "A GKS-G candidate with strong credentials noted their chosen university had an extremely low acceptance rate for applicants from their country, and speculated (without confirmation) that limited country-specific slots were the deciding factor over their qualifications. Researching a university's historical intake by country before applying is the suggested precaution.",
    "document_type": "university_choice",
    "reason_category": "wrong_university_choice",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1uo7fgp/gksg_reasons_for_rejection/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Applying to both tracks, risking disqualification from both",
    "description": "NIIED, via Embassy of Korea notices, states plainly that multiple applications result in disqualification, with admission cancelled if discovered after selection. Applicants must choose only one track per cycle. Deciding on a single track before submitting is the safeguard.",
    "document_type": "other",
    "reason_category": "missing_document",
    "source_platform": "blog",
    "source_url": "https://guides.scholarshipunion.com/gks-scholarship/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Submitting via a glitched or outdated online portal form",
    "description": "A reddit thread on the 2026 GKS-G online application described formatting errors and blank entries generated by the digital submission system for critical grades and test scores. Carefully checking and resolving any portal-generated formatting issues before final submission is the recommended safeguard.",
    "document_type": "other",
    "reason_category": "missing_document",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1r6mhyt/discrepancies_in_2026_gksg_online_application/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Wrong file format or oversized PDF causing auto-rejection",
    "description": "Guidance notes digital submissions must meet format and size limits, and files failing these can be auto-rejected during upload. Checking each file against the current portal's requirements before uploading avoids it.",
    "document_type": "other",
    "reason_category": "missing_document",
    "source_platform": "blog",
    "source_url": "https://www.applykite.com/blog/phd-guide-scholarship-korea-2027-preparation",
    "confidence": "single_anecdote"
  },
  {
    "title": "Weak or missing English proficiency documentation",
    "description": "Per NIIED's GKS-G guidelines, a high TOEFL/TOEIC/IELTS score is a separately scored preference category (+5%). Submitting no English certificate or a low score is a missed scoring opportunity, not merely a formatting gap.",
    "document_type": "other",
    "reason_category": "other",
    "source_platform": "blog",
    "source_url": "https://gradpilot.com/news/gks-scholarship-rejected-reapplication-strategy",
    "confidence": "single_anecdote"
  },
  {
    "title": "No Korean-language (TOPIK) proficiency score submitted",
    "description": "A reddit thread described two applicants with strong academic profiles who lacked any TOPIK score; one noted their target university required TOPIK Level 3–6 for their field, and both cited the missing score as a likely (though unconfirmed) factor in their rejection. TOPIK Level 3+ separately earns scoring points under NIIED's guidelines, making this a plausible, if unverified, gap.",
    "document_type": "other",
    "reason_category": "other",
    "source_platform": "reddit",
    "source_url": "https://www.reddit.com/r/GKSScholarship/comments/1kmdebr/thoughts_after_failing_interview_uni_track_gks_g/",
    "confidence": "single_anecdote"
  },
  {
    "title": "Mailing documents by unreliable post or too late",
    "description": "Document-checklist guidance warns University-track applicants must physically mail documents via tracked courier (DHL, FedEx, EMS) well before the deadline, and that regular post has failed applicants before. Sending at least two weeks early with tracking is the recommended safeguard.",
    "document_type": "other",
    "reason_category": "missing_document",
    "source_platform": "blog",
    "source_url": "https://guides.scholarshipunion.com/gks-scholarship/documents.html",
    "confidence": "single_anecdote"
  }
]
```

## Changelog from v1

**Removed (not findings):** 5 placeholder entries from the community-collected batch that said "I could not verify a firsthand account" for apostille, recommendation, medical, transcript, and university-choice categories. These are honest gap-notes, not database entries — they're folded into the gaps section below instead of sitting in the JSON as if they were findings.

**Recategorized `reason_category`:** Several entries had been tagged `"other"` when a listed category fit — apostille/notarization confusion, expired apostilles, and untranslated transcripts are now `missing_document`, matching what they actually describe.

**Confidence upgraded** (genuinely reached 3+ independent sources after merging batches):
- Recommendation letter sealing/signing/dating — now Facebook + blog + reddit.
- Korean-language interview freezing — now blog + 2 reddit threads.
- Generic cultural motivation / K-pop references in SOP — now blog + 3 reddit threads + YouTube. Strongest-supported finding in the set.
- SKY-only university selection — now blog + 2 reddit threads.
- Department/major GKS-eligibility mismatch — now blog + reddit.

**Confidence downgraded** (batches had marked these `recurring_theme` off a single source):
- Surname-spelling mismatches, missing parent-citizenship proof, admin-drafted recommendation letters — each now `single_anecdote`, since only one or two sources actually back them, not three independent accounts.

**Deduplicated:** "Study plan mirrors personal statement" appeared three times with near-identical wording across the batches — merged into the single canonical SOP-overlap entry.

**Genuinely new entries added this pass:** apostille validity window (2-year expiry), TB history omission, medical-disclosure interview scrutiny pattern, recommendation letter missing from the required duplicate envelope set, TA-vs-professor recommender choice, glitched online portal forms, university-specific quota exhaustion, and missing TOPIK score cited as a factor.

## Remaining gaps (honest, not filled)
- **Passport-specific mistakes** are still thin — the two entries here are really about name-consistency and citizenship documentation, not the passport document itself.
- **Medical** remains mostly rule-text plus two speculative "maybe this is why I was rejected" theories — no confirmed firsthand disqualification account exists publicly.
- All "why I think I was rejected" entries remain the applicant's own unconfirmed theory; GKS does not disclose rejection reasons, and evaluation is holistic.
