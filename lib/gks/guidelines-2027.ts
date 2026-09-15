export type GuidelineTopic =
  | "eligibility"
  | "grades"
  | "deadline"
  | "university_choice"
  | "documents"
  | "apostille"
  | "language"
  | "evaluation"
  | "fallback"
  | "passport"
  | "recommendation"
  | "graduation"
  | "benefits";

export interface GksU2027GuidelineEvidence {
  id: string;
  topic: GuidelineTopic;
  page: number;
  claim: string;
  keywords: string[];
}

export const GKS_U_2027_SOURCE = {
  title: "2027 GKS-U Application Guidelines",
  cycle: "2027",
  sourceUrl:
    "https://www.studyinkorea.go.kr/ko/plan/gksNoticeRead.do?bbsId=BBSMSTR_000000000461&nttId=4522",
} as const;

/**
 * Applicant-facing, retrieval-ready facts extracted from the official English
 * 2027 GKS-U guideline. Keep these concise and atomic: each claim should be
 * independently citable and safe to show without neighboring PDF text.
 */
export const GKS_U_2027_EVIDENCE: GksU2027GuidelineEvidence[] = [
  {
    id: "age",
    topic: "eligibility",
    page: 7,
    claim: "Applicants must be under 25 years of age, meaning born after March 1, 2002.",
    keywords: ["age", "old", "born", "25", "eligibility"],
  },
  {
    id: "citizenship",
    topic: "eligibility",
    page: 7,
    claim:
      "Applicants must hold citizenship of an NIIED-designated country, while the UIC program is open to all countries. Applicants and their parents or legal guardians must not hold Korean citizenship.",
    keywords: ["citizenship", "nationality", "korean", "parents", "guardian", "uic", "country"],
  },
  {
    id: "education-bachelor",
    topic: "graduation",
    page: 7,
    claim:
      "For a bachelor's degree, applicants must have graduated or be expected to graduate from high school or an associate-degree program.",
    keywords: ["graduate", "graduation", "high school", "associate", "bachelor", "expected"],
  },
  {
    id: "expected-graduate-deadline",
    topic: "graduation",
    page: 7,
    claim:
      "Applicants expected to graduate must complete graduation requirements and submit the final graduation certificate and transcript by December 31, 2026 if they pass the first round.",
    keywords: ["expected", "graduate", "december 31", "certificate", "transcript"],
  },
  {
    id: "grade-rule",
    topic: "grades",
    page: 8,
    claim:
      "Academic eligibility requires at least one of these: 80% or above on a 100-point scale, rank within the top 20% of the class, or the stated minimum CGPA on an accepted scale.",
    keywords: ["grade", "grades", "gpa", "cgpa", "80", "top 20", "percentage", "rank"],
  },
  {
    id: "grade-conversion",
    topic: "grades",
    page: 8,
    claim:
      "If the transcript does not provide an accepted CGPA scale, the applicant must submit an official document from the school explaining the grading system or an officially authenticated conversion.",
    keywords: ["convert", "conversion", "gpa scale", "grading system", "scholaro", "wes", "transcript"],
  },
  {
    id: "embassy-window",
    topic: "deadline",
    page: 9,
    claim:
      "Embassy Track online applications run from September 15, 2026 at 11:00 to September 30, 2026 at 18:00, Korea Standard Time, through Study in Korea.",
    keywords: ["deadline", "date", "application", "september", "embassy", "online", "study in korea"],
  },
  {
    id: "university-window",
    topic: "deadline",
    page: 9,
    claim:
      "University Track applications run from September through November 2026 according to each university's own schedule and submission method.",
    keywords: ["university track", "deadline", "september", "november", "schedule"],
  },
  {
    id: "embassy-general-choice",
    topic: "university_choice",
    page: 6,
    claim:
      "Embassy Track General and Overseas Koreans & Adoptees applicants may choose up to three universities, and at least one choice must be a Type B university.",
    keywords: ["three", "3", "university", "universities", "choice", "type b", "general", "embassy"],
  },
  {
    id: "rgks-choice",
    topic: "university_choice",
    page: 6,
    claim: "R-GKS Embassy Track applicants may choose up to two Type B universities.",
    keywords: ["r-gks", "rgks", "two", "2", "type b", "university", "choice"],
  },
  {
    id: "university-track-choice",
    topic: "university_choice",
    page: 6,
    claim: "University Track applicants may apply to only one university and one department.",
    keywords: ["university track", "one", "1", "department", "university", "choice"],
  },
  {
    id: "no-field-transfer",
    topic: "university_choice",
    page: 6,
    claim: "After final selection, transfer to a different field of study is not permitted.",
    keywords: ["change major", "change department", "transfer", "field", "major"],
  },
  {
    id: "first-round-online",
    topic: "documents",
    page: 14,
    claim:
      "For the Embassy Track first round, applicants complete and upload application documents through Study in Korea; required certificates and the recommendation letter are uploaded as scanned copies.",
    keywords: ["first round", "scan", "scanned", "upload", "document", "recommendation", "embassy"],
  },
  {
    id: "form-1",
    topic: "documents",
    page: 12,
    claim:
      "Form 1 is the Application Form. Embassy Track applicants complete it directly in the Study in Korea system; first-round successful candidates print it and provide the required original handwritten signatures for the NIIED second round.",
    keywords: ["form 1", "application form", "application", "signature"],
  },
  {
    id: "form-2",
    topic: "documents",
    page: 12,
    claim:
      "Form 2 is the Personal Statement. Embassy Track applicants complete it directly in the Study in Korea system; it may be written in English or Korean.",
    keywords: ["form 2", "personal statement", "english", "korean"],
  },
  {
    id: "form-3",
    topic: "documents",
    page: 12,
    claim:
      "Form 3 is the Study Plan. Embassy Track applicants complete it directly in the Study in Korea system; it may be written in English or Korean.",
    keywords: ["form 3", "study plan", "english", "korean"],
  },
  {
    id: "form-4",
    topic: "recommendation",
    page: 12,
    claim:
      "Form 4 is the Recommendation Letter. For the Embassy Track first round, a scanned copy prepared by the recommender is uploaded; first-round successful candidates submit the original letter for the NIIED second round.",
    keywords: ["form 4", "recommendation letter", "recommender", "original letter", "scanned copy"],
  },
  {
    id: "form-5",
    topic: "documents",
    page: 12,
    claim:
      "Form 5 is the GKS Applicant Agreement. Embassy Track applicants complete it directly in the Study in Korea system and, after passing the first round, print the form and provide the required signature.",
    keywords: ["form 5", "gks applicant agreement", "applicant agreement", "signature"],
  },
  {
    id: "form-6",
    topic: "documents",
    page: 12,
    claim:
      "Form 6 is the Personal Medical Assessment. Embassy Track applicants complete it directly in the Study in Korea system and, after passing the first round, print the form and provide the required signature.",
    keywords: ["form 6", "personal medical assessment", "medical assessment", "signature"],
  },
  {
    id: "form-7",
    topic: "documents",
    page: 12,
    claim:
      "Form 7 is the Consent to Collect and Use Personal Information. Embassy Track applicants complete it directly in the Study in Korea system and, after passing the first round, print the form and provide the required signature.",
    keywords: ["form 7", "consent", "collect and use personal information", "personal information", "signature"],
  },
  {
    id: "university-track-forms",
    topic: "documents",
    page: 13,
    claim:
      "For University Track, Forms 1-3 and 5-7 are completed according to the university's application method, while Form 4 is completed by the recommender. First-round successful candidates submit the original/printed forms for the NIIED second round as instructed.",
    keywords: ["university track forms", "university track", "form 1", "form 4", "forms 1-7"],
  },
  {
    id: "first-round-no-apostille",
    topic: "apostille",
    page: 14,
    claim:
      "For the Embassy Track first round, required certificates are submitted as scanned copies online. Apostille or consular confirmation is not required at this first online submission stage; applicants who pass the first round must then prepare the authenticated certificates required for NIIED's second round.",
    keywords: ["first round apostille", "apostille first round", "first round", "apostille", "consular", "scanned copies", "embassy"],
  },
  {
    id: "second-round-original",
    topic: "documents",
    page: 14,
    claim:
      "Applicants who pass the first round must submit the required original and certified documents by the deadline and method specified by the embassy or university for NIIED's second round.",
    keywords: ["second round", "original", "certified", "document", "niied", "pass"],
  },
  {
    id: "forms-no-apostille",
    topic: "apostille",
    page: 14,
    claim:
      "Application forms and other documents-to-complete do not need to be apostilled or consular confirmed for the second round.",
    keywords: ["apostille", "form", "forms", "consular", "application form", "study plan", "personal statement"],
  },
  {
    id: "certificates-apostille",
    topic: "apostille",
    page: 15,
    claim:
      "Required certificates for the second round must generally be apostilled or consular confirmed. Documents in languages other than English or Korean also require a certified translation.",
    keywords: ["apostille", "consular", "certificate", "translation", "english", "korean"],
  },
  {
    id: "notarized-copy-rule",
    topic: "apostille",
    page: 15,
    claim:
      "Simple photocopies or ordinary notarized copies of apostilled or consular-confirmed documents are not accepted as substitutes for the authenticated document; certified true copies are accepted only in the circumstances described by the guideline.",
    keywords: ["photocopy", "copy", "notarized", "true copy", "apostille", "consular"],
  },
  {
    id: "passport-supplementary",
    topic: "passport",
    page: 17,
    claim:
      "A passport copy is optional and is used as a supplementary document when proof of citizenship does not clearly show citizenship information.",
    keywords: ["passport", "citizenship", "optional", "supplementary"],
  },
  {
    id: "recommendation-one-year",
    topic: "recommendation",
    page: 17,
    claim:
      "One recommendation letter is required, written by a credible person who can evaluate the applicant's academic ability, and it must be issued within one year of the application deadline.",
    keywords: ["recommendation", "recommender", "teacher", "principal", "one year", "letter"],
  },
  {
    id: "language-valid-tests",
    topic: "language",
    page: 17,
    claim:
      "Recognized language score reports are TOPIK for Korean and TOEFL or IELTS for English; submission is optional unless otherwise required by the institution.",
    keywords: ["topik", "toefl", "ielts", "english", "korean", "language", "score"],
  },
  {
    id: "language-band-topik3",
    topic: "language",
    page: 19,
    claim:
      "In the official language-proficiency scoring table, TOPIK level 3 corresponds to 80% of the institution's allocated Korean-language score.",
    keywords: ["topik 3", "topik level 3", "language points", "80"],
  },
  {
    id: "language-band-ielts7",
    topic: "language",
    page: 19,
    claim:
      "In the official language-proficiency scoring table, IELTS 7.0 or above corresponds to 80% of the institution's allocated English-language score, while IELTS 8.0 or above corresponds to 90%.",
    keywords: ["ielts", "7.0", "7", "7.5", "8.0", "language points", "english"],
  },
  {
    id: "topik-bonus",
    topic: "evaluation",
    page: 19,
    claim:
      "TOPIK level 3 or above receives quantitative additional points: level 3 = 3% of the total score, level 4 = 4%, and level 5 or above = 5%.",
    keywords: ["topik", "bonus", "additional points", "3%", "4%", "5%"],
  },
  {
    id: "stem-bonus",
    topic: "evaluation",
    page: 20,
    claim: "Applicants to science and engineering departments receive additional points equal to 5% of the total allocated points.",
    keywords: ["science", "engineering", "stem", "bonus", "5%", "additional points"],
  },
  {
    id: "evaluation-factors",
    topic: "evaluation",
    page: 19,
    claim:
      "Competency review considers academic performance, language proficiency, academic activities, contributions to society and international exchange, future potential, and document completeness and authenticity.",
    keywords: ["evaluation", "competency", "academic", "activities", "contribution", "future", "documents"],
  },
  {
    id: "parents-passport-faq",
    topic: "passport",
    page: 34,
    claim:
      "A parent's passport copy is not automatically required. The applicant must submit an official document proving the family relationship, and additional citizenship evidence such as a passport copy is needed if that document does not include citizenship information.",
    keywords: ["parents passport", "parent passport", "birth certificate", "family register", "family relationship", "citizenship proof"],
  },
  {
    id: "absent-parent-citizenship-faq",
    topic: "eligibility",
    page: 34,
    claim:
      "If a parent's citizenship proof cannot be issued because the parent is absent, for example due to divorce or death, the applicant should provide supplementary documents explaining the reason, such as a divorce certificate or death certificate.",
    keywords: ["deceased parent", "dead parent", "divorce", "parent absent", "parent citizenship", "death certificate"],
  },
  {
    id: "different-parent-citizenship-faq",
    topic: "eligibility",
    page: 34,
    claim:
      "An applicant and their parents may hold different citizenships. Eligibility is possible as long as the applicant holds citizenship of an invited country and neither the applicant nor the parent or parents hold Korean citizenship; UIC is open worldwide except Korea.",
    keywords: ["different citizenship", "parents different nationality", "mixed nationality", "uic worldwide"],
  },
  {
    id: "korea-exchange-study-faq",
    topic: "eligibility",
    page: 35,
    claim:
      "Previous exchange study in Korea does not by itself make an applicant ineligible. However, a high-school diploma from a school located in Korea, including an international school, or an associate degree from a university located in Korea makes the applicant ineligible for GKS-U.",
    keywords: ["exchange student", "studied in korea", "korea high school", "international school", "associate degree korea"],
  },
  {
    id: "existing-bachelor-ineligible-faq",
    topic: "eligibility",
    page: 35,
    claim:
      "An applicant who already has a bachelor's degree is not eligible to apply for a GKS-U bachelor's degree, even for a different major.",
    keywords: ["already bachelor", "bachelor degree holder", "second bachelor", "different major", "another bachelor"],
  },
  {
    id: "provisional-graduation-faq",
    topic: "graduation",
    page: 36,
    claim:
      "A provisional or temporary graduation certificate is judged case by case, but it must clearly state the graduation date. A temporary certificate without a graduation date is not accepted, and a successful candidate who applied with a provisional document must submit the final diploma or graduation certificate by December 31, 2026.",
    keywords: ["provisional certificate", "temporary certificate", "graduation date", "final diploma", "december 31"],
  },
  {
    id: "top20-below80-faq",
    topic: "grades",
    page: 37,
    claim:
      "An applicant whose converted percentage is below 80% can still meet the academic requirement by ranking within the top 20% of the class, supported by an official certificate or letter from the school.",
    keywords: ["below 80", "less than 80", "top 20", "class rank", "rank certificate"],
  },
  {
    id: "semester-grades-blank-faq",
    topic: "grades",
    page: 37,
    claim:
      "If the official transcript does not provide GPA by semester or year, those semester or year fields in the application may be left blank, but the applicant must provide the CGPA or at least the percentile for the entire curriculum period.",
    keywords: ["semester gpa", "year gpa", "blank", "only cgpa", "entire curriculum", "percentile"],
  },
  {
    id: "no-direct-niied-application-faq",
    topic: "documents",
    page: 39,
    claim:
      "Applicants cannot submit application documents directly to NIIED. Embassy Track applicants submit through Study in Korea to the relevant embassy route, while University Track applicants follow the relevant university's own submission method.",
    keywords: ["direct niied", "submit to niied", "where submit", "application method", "online application", "university website"],
  },
  {
    id: "apostille-country-branch-faq",
    topic: "apostille",
    page: 40,
    claim:
      "For required-certificate legalization, applicants from Apostille Convention countries use an apostille. Applicants from non-member countries, or where a document genuinely cannot be apostilled, should obtain consular or other possible confirmation from the Korean embassy or consulate as described in the guideline.",
    keywords: ["apostille convention", "hague", "member country", "non member", "consular confirmation", "cannot apostille"],
  },
  {
    id: "authenticated-copy-nonreturn-faq",
    topic: "apostille",
    page: 41,
    claim:
      "Documents submitted to NIIED are not returned. If an original graduation certificate cannot be re-issued, the guideline advises obtaining apostille or consular confirmation on a certified true copy rather than sending an irreplaceable original without a replacement plan.",
    keywords: ["return original", "documents returned", "cannot reissue", "certified copy", "graduation certificate"],
  },
  {
    id: "recommendation-up-to-two-faq",
    topic: "recommendation",
    page: 42,
    claim:
      "One recommendation letter is required, but an applicant may optionally submit letters from up to two referees. The guideline recommends a person who can thoroughly assess the applicant's academic ability, such as a teacher, principal, or department chair.",
    keywords: ["two recommendation", "2 recommendation", "two referees", "teacher", "principal", "department chair"],
  },
  {
    id: "university-recommendation-sealed-faq",
    topic: "recommendation",
    page: 43,
    claim:
      "For University Track, the recommender's completed recommendation letter should be placed in a sealed envelope, signed across the back flap by the recommender, and submitted to the chosen university in its sealed state.",
    keywords: ["sealed recommendation", "sealed envelope", "back flap", "sign across", "university track recommendation"],
  },
  {
    id: "duplicate-university-track-faq",
    topic: "fallback",
    page: 43,
    claim:
      "University Track applicants may apply to only one university and one department. Applying to multiple universities through University Track can lead to exclusion from later evaluation or cancellation even after selection; Embassy and University tracks cannot be used simultaneously.",
    keywords: ["duplicate application", "multiple university track", "both tracks", "simultaneous", "cancel scholarship"],
  },
  {
    id: "round1-results-faq",
    topic: "deadline",
    page: 44,
    claim:
      "First-round results are announced by each first-round institution: Embassy Track results are expected by October 16, while University Track universities notify applicants individually in November. Later results are posted on the Study in Korea GKS notice board.",
    keywords: ["first round result", "october 16", "november", "selection result", "accepted", "result date"],
  },
  {
    id: "language-program-topik3-faq",
    topic: "language",
    page: 44,
    claim:
      "GKS scholars normally must achieve at least TOPIK level 3 during the one-year Korean language program to proceed to the degree program, and a university or department may require a higher TOPIK level for degree entry.",
    keywords: ["language program", "topik 3", "one year korean", "degree entry", "topik after selection"],
  },
  {
    id: "language-program-same-university-faq",
    topic: "language",
    page: 44,
    claim:
      "GKS scholars take the Korean language program at the same university where they will conduct the degree program.",
    keywords: ["language institute", "same university", "korean language university", "different region"],
  },
  {
    id: "language-program-exemption-faq",
    topic: "language",
    page: 45,
    claim:
      "Applicants who already hold valid TOPIK level 5 or 6 at application must submit the certificate and are exempt from the yearlong Korean language program, starting the degree in March 2027. A TOPIK 5 or 6 obtained after the initial application deadline may still qualify if the valid certificate is submitted to NIIED by December 24, 2026 as specified in the guideline.",
    keywords: ["topik 5", "topik 6", "language exemption", "exempt korean", "december 24", "march 2027"],
  },
  {
    id: "language-program-six-month-exemption-faq",
    topic: "language",
    page: 45,
    claim:
      "A scholar who attains TOPIK level 5 or 6 during the first six months of the Korean language program is exempt from the remaining six months and starts the degree program in the following semester, September 2027.",
    keywords: ["six months", "6 months", "topik 5 during language", "september 2027", "early degree start"],
  },
  {
    id: "no-university-change-faq",
    topic: "university_choice",
    page: 45,
    claim:
      "Changing the final university choice or transferring to another university during the Korean language program or degree program is not permitted.",
    keywords: ["change university", "transfer university", "final university", "during language program", "during degree"],
  },
  {
    id: "scholarship-period",
    topic: "benefits",
    page: 23,
    claim:
      "The standard scholarship period is 5-7 years for a bachelor's program (1 year of Korean language study plus 4-6 years of degree study) and 3-4 years for an associate program (1 year of Korean language study plus 2-3 years of degree study).",
    keywords: ["scholarship period", "how many years", "duration", "bachelor years", "associate years", "korean language year"],
  },
  {
    id: "tuition-benefit",
    topic: "benefits",
    page: 23,
    claim:
      "For the degree program, NIIED supports tuition up to 5 million KRW; the university covers the amount above 5 million KRW and the admission fee.",
    keywords: ["tuition", "5 million", "admission fee", "university pays", "niied tuition"],
  },
  {
    id: "language-program-fee-benefit",
    topic: "benefits",
    page: 23,
    claim:
      "The Korean language program fee benefit is 5.2 million KRW per year for scholars in the Korean language program.",
    keywords: ["language program fee", "5.2 million", "korean language fee"],
  },
  {
    id: "monthly-allowance-benefit",
    topic: "benefits",
    page: 23,
    claim:
      "The annual all-inclusive allowance stated in the 2027 guideline is 13,560,000 KRW during the Korean language program and 14,400,000 KRW during the degree program.",
    keywords: ["monthly allowance", "allowance", "13,560,000", "14,400,000", "living expenses", "stipend"],
  },
  {
    id: "airfare-benefit",
    topic: "benefits",
    page: 23,
    claim:
      "GKS provides an economy-class flight ticket at actual expense, but entry airfare is not provided to newly selected scholars already residing in Korea at the time of the final announcement.",
    keywords: ["airfare", "flight ticket", "economy", "already in korea", "entry airfare"],
  },
  {
    id: "benefit-all-inclusive-note",
    topic: "benefits",
    page: 23,
    claim:
      "The allowance is described as an all-inclusive subsidy covering living expenses, accommodation, health insurance, Korean proficiency grants, TOPIK application fees, settlement allowance, and degree-completion grants; amounts may be subject to change.",
    keywords: ["health insurance", "accommodation", "settlement allowance", "topik fee", "degree completion grant", "living expense"],
  },
  {
    id: "fallback-fail-first",
    topic: "fallback",
    page: 9,
    claim:
      "Applicants who fail the Embassy Track first round may apply again through University Track, subject to the university's own application deadline.",
    keywords: ["fail", "failed", "first round", "university track", "fallback", "embassy"],
  },
  {
    id: "fallback-pass-block",
    topic: "fallback",
    page: 9,
    claim:
      "Embassy Track applicants who pass the first round, including backup candidates, cannot apply again through University Track.",
    keywords: ["pass", "passed", "backup", "university track", "embassy", "duplicate"],
  },
];

export const GKS_U_2027_TYPE_A = [
  "Ajou University",
  "Chung-Ang University",
  "Dongguk University",
  "Ewha Womans University",
  "Hankuk University of Foreign Studies",
  "Hansung University",
  "Hanyang University",
  "Hongik University",
  "Incheon National University",
  "Inha University",
  "Kookmin University",
  "Korea University",
  "Kyungdong University",
  "KyungHee University",
  "Myongji University",
  "Pohang University of Science and Technology (POSTECH)",
  "Sejong University",
  "Seokyeong University",
  "Seoul National University",
  "Seoul National University of Science and Technology",
  "Sogang University",
  "Soongsil University",
  "Sungkyunkwan University",
  "Sungshin Women's University",
  "The Catholic University of Korea",
  "Ulsan National Institute of Science and Technology (UNIST)",
  "University of Seoul",
  "Yonsei University",
] as const;

export const GKS_U_2027_TYPE_B = [
  "Busan University of Foreign Studies",
  "Changwon National University",
  "Cheongju University",
  "Chonnam National University",
  "Chosun University",
  "Chungbuk National University",
  "Chungnam National University",
  "Daegu Catholic University",
  "Daegu University",
  "Daejeon University",
  "Dong-A University",
  "Gyeongkuk National University",
  "Gyeongsang National University",
  "Hanbat National University",
  "Hannam University",
  "Hoseo University",
  "Inje University",
  "Jeju National University",
  "Jeonbuk National University",
  "Kangwon National University",
  "Keimyung University",
  "Kongju National University",
  "Konyang University",
  "Korea National University of Transportation",
  "Korea University of Technology and Education (KOREATECH)",
  "Kunsan National University",
  "Kyungpook National University",
  "Kyungsung University",
  "Kyungwoon University",
  "Mokwon University",
  "Pai Chai University",
  "Pukyong National University",
  "Pusan National University",
  "Semyung University",
  "Silla University",
  "Soonchunhyang University",
  "Sun Moon University",
  "Sunchon National University",
  "Tongmyong University",
  "University of Ulsan",
  "Wonkwang University",
  "Yeungnam University",
] as const;


export const GKS_U_2027_UIC_ASSOCIATE_DEPARTMENTS: Record<string, readonly string[]> = {
  "Dong-Eui Institute of Technology": ["Electrical Engineering", "Mechanical Engineering"],
  "Kyungbok University": ["Software Convergence"],
  "Osan University": ["Mechanical Engineering"],
};

export const GKS_U_2027_ASSOCIATE_DEGREE_UNIVERSITIES = [
  "Busan Institute of Science and Technology",
  "Cheju Halla University",
  "Dong-Eui Institute of Technology",
  "Induk University",
  "Korea University of Media Arts",
  "Kyungbok University",
  "Kyung-In Women's University",
  "Kyungnam College of Information & Technology",
  "Yeungnam University College",
] as const;

export const GKS_U_2027_UIC_BACHELOR_DEPARTMENTS: Record<string, readonly string[]> = {
  "Ajou University": ["School of AI and Computer Engineering"],
  "Daegu University": ["Division of Electronic Engineering"],
  "Dong-A University": ["Food Science and Nutrition", "Medicinal Biotechnology"],
  "Inje University": [
    "AI Software",
    "Food Nutrition and Food Engineering",
    "Medical Information Technology",
    "Mechanical and Electrical Automotive Engineering",
  ],
  "Keimyung University": ["Mechanical Engineering"],
  "Konyang University": ["Artificial Intelligence", "Smart Security"],
  "Kookmin University": ["Software"],
  "Korea University of Technology and Education (KOREATECH)": [
    "Mechanical Engineering Major",
    "Computer Engineering Major",
  ],
  "Sungshin Women's University": ["Statistics/Big Data Science Major"],
  "Yeungnam University": ["Environmental Engineering"],
};
