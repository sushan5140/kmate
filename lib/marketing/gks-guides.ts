export const SITE_URL = "https://kmate.vercel.app";
export const OFFICIAL_NOTICE_LIST = "https://www.studyinkorea.go.kr/ko/notice/scholarshipsList.do?boardSort=3";
export const GKS_U_NOTICE = "https://www.studyinkorea.go.kr/ko/notice/scholarshipsRead.do?bbsId=BBSMSTR_000000000461&nttId=4522";
export const GKS_G_HISTORICAL_NOTICE = "https://studyinkorea.go.kr/ko/plan/gksNoticeRead.do?bbsId=BBSMSTR_000000000461&nttId=4420";
type Guide = {
  slug: string; title: string; description: string; heading: string; intro: string;
  sections: { title: string; body: string }[];
  sources: { label: string; href: string }[];
  tool: { label: string; href: string };
};
export const GUIDES: Guide[] = [
  {
    slug: "gks-g-2027-preparation", title: "GKS-G 2027 preparation checklist | KMate",
    description: "Prepare for the 2027 Global Korea Scholarship graduate application: records, referees, department research, language tests and official source checks.",
    heading: "Prepare for GKS-G 2027 before the application opens",
    intro: "A planning guide, not the 2027 application rules. On 26 November 2026, we located the general 2026 graduate guidelines but not the general 2027 graduate announcement. Check current official notices before acting.",
    sections: [
      { title: "Start with documents that take time", body: "Ask your academic institution how to obtain transcripts, degree certificates or expected-graduation evidence and grading-scale explanations. Investigate processing times before paying for authentication or translation." },
      { title: "Research a department, not just a university", body: "Read the official department pages, courses and lab research. Record the exact language policy, supervisor instructions and application method when a current-cycle source is available. Older participation lists do not confirm 2027 availability." },
      { title: "Prepare authentic application material", body: "Talk to potential referees about availability and gather evidence of your academic work. Outline your motivation, academic goals and realistic study plan; use current-cycle forms when they are published." },
      { title: "Recheck before submitting", body: "Verify eligibility, eligible departments, routes, recommendation instructions, forms and deadlines in the general current-cycle notice and the first-round institution's instructions. An informal faculty reply is not an admission or scholarship guarantee." },
    ],
    sources: [{label:"2026 GKS-G guideline (historical)",href:GKS_G_HISTORICAL_NOTICE},{label:"Current Study in Korea notices",href:OFFICIAL_NOTICE_LIST}],
    tool: { label: "Open graduate preparation hub", href: "/application-readiness?program=GKS-G&cycle=2027&own=1#graduate-preparation" },
  },
  {
    slug: "gks-u-2027-next-steps", title: "GKS-U 2027 application and selection next steps | KMate",
    description: "Check the official 2027 undergraduate GKS guideline, first-round instructions and your application documents before acting on selection updates.",
    heading: "GKS-U 2027: make sense of your application and selection updates",
    intro: "The 2027 undergraduate guidelines were announced on 9 September 2026. Individual institutions' schedules and results vary. This page is not a live selection result or deadline notice.",
    sections: [
      { title: "Identify the notice that applies to you", body: "Use the 2027 GKS-U national announcement and your embassy or university's official instructions. A result from another institution or route is not evidence of your own status." },
      { title: "Keep your submission record", body: "Record where and when you submitted, any receipt confirmation, document correction request and interview instructions. Keep your own copies secure." },
      { title: "Prepare for an interview if invited", body: "Review your actual application, reasons for your chosen department, academic experiences and realistic study goals. Practice answering questions clearly rather than memorising invented achievements." },
      { title: "Confirm each outcome from its issuer", body: "Track self-reported progress separately from official notices. Do not assume that passing one selection stage guarantees the final scholarship." },
    ],
    sources: [{label:"Official 2027 GKS-U announcement",href:GKS_U_NOTICE},{label:"Current Study in Korea notices",href:OFFICIAL_NOTICE_LIST}],
    tool: {label:"Open undergraduate readiness",href:"/application-readiness?program=GKS-U&cycle=2027&own=1"},
  },
  {
    slug: "gks-document-checklist", title: "GKS documents and apostille preparation checklist | KMate",
    description: "A practical GKS document preparation checklist for certificates, translations, authentication, forms and first-round submission verification.",
    heading: "GKS documents: what to verify before submitting",
    intro: "This is a document preparation workflow, not a universal list of mandatory documents. Requirements depend on your application cycle, issuing country, route and recipient.",
    sections: [
      {title:"Identify the underlying document",body:"List the certificates and academic records required by your current official checklist. Verify whether original documents or certified copies are accepted."},
      {title:"Check authentication and translation",body:"For each applicable document, confirm the accepted authentication method, authority, translation language, certification and attachment instructions. An apostille alone does not replace an underlying certificate when that certificate is required."},
      {title:"Verify forms and delivery",body:"Confirm current-cycle forms, signatures, recommendation instructions, document order, copies, submission address or portal, and deadline time zone from the first-round recipient."},
      {title:"Keep unknowns visible",body:"When an official source does not state a requirement, ask the recipient. Do not treat missing information as a waiver. A completed planning checklist is not a guarantee of eligibility or acceptance."},
    ],
    sources: [{label:"Study in Korea scholarship notices",href:OFFICIAL_NOTICE_LIST}],
    tool: {label:"Open the Apostille Guide",href:"/apostille"},
  },
  {
    slug: "gks-university-requirements", title: "GKS university and department requirements | KMate",
    description: "How to check GKS university eligibility, language requirements, professor consent and additional documents without mixing scholarship cycles.",
    heading: "How to verify GKS university and department requirements",
    intro: "A university's ordinary international admissions instructions are not automatically its GKS instructions. Start with the relevant program, route, cycle and department.",
    sections: [
      {title:"Start with the official participating-university file",body:"Use the current national GKS notice and university information file. Treat older-cycle department listings as research leads, not a guarantee of eligibility."},
      {title:"Check language evidence",body:"Look for the exact accepted test, score, validity, teaching language and exemption wording. Do not infer an IELTS or TOPIK requirement or exemption from silence."},
      {title:"Check department-specific instructions",body:"Look for supervisor consent, additional forms, portfolio, interview and submission requirements in official department or scholarship instructions. Keep records from different tracks separate."},
      {title:"Record the evidence",body:"Keep the official URL, source cycle, date checked and exact unresolved question. Contact the university if the instructions are ambiguous. KMate's checker preserves unknowns and labels older details."},
    ],
    sources: [{label:"Official 2027 undergraduate announcement",href:GKS_U_NOTICE},{label:"Study in Korea scholarship notices",href:OFFICIAL_NOTICE_LIST}],
    tool: {label:"Open Requirement Checker",href:"/requirement-checker"},
  },
];
export function guidePath(slug: string) { return "/gks-guides/" + slug; }
export function guestToolHref(path: string) { return "/guest/start?next=" + encodeURIComponent(path); }
export const PUBLIC_GUIDE_PATHS = ["/gks-guides", ...GUIDES.map(g => guidePath(g.slug))];
