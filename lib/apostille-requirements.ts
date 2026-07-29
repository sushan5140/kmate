import type { Track } from "@/lib/constants";

/**
 * GKS document-authentication (apostille / consular confirmation) reference
 * data, sourced from the official NIIED master guidelines and a handful of
 * embassy notices with confirmed country-specific divergence. Static
 * reference content -- same for every viewer, so it's a plain module rather
 * than a database table, same reasoning as lib/official-guidelines.ts.
 *
 * Sourced from a multi-pass research effort (see the project's working
 * notes) that deliberately excluded two categories from what ships here:
 * countries with NO country-specific notice found (the general default
 * below already covers them -- absence from countryOverrides is not the
 * same as "unknown requirement"), and unverified social-media-sourced leads
 * (e.g. a claim about Vietnam's pending Hague Apostille Convention
 * accession -- real signal, but not yet confirmed by a GKS/embassy source
 * for how it applies procedurally, so it isn't shown as fact here).
 *
 * NIIED republishes guidelines each cycle and embassies can revise their
 * notices without notice -- same "verify and update each cycle" caveat as
 * the university list, deadline estimates, and official-guidelines PDFs
 * elsewhere in this codebase.
 */

export interface GksUDocumentRow {
  no: string;
  name: string;
  requirement: "Required" | "Optional";
}

export interface GksGDocumentRow {
  no: string;
  name: string;
  masters: string;
  doctoral: string;
}

export interface ApostilleGeneralDefault {
  summary: string[];
  documentsRequiringAuthentication: {
    note: string;
    gksU?: GksUDocumentRow[];
    gksG?: GksGDocumentRow[];
  };
  documentsNotRequiringAuthentication: {
    forms: string[];
    otherOptional: string[];
  };
  sources: { label: string; url: string }[];
  lastCheckedDate: string;
}

export interface CountryOverride {
  country: string;
  embassyOrConsulate: string;
  trackLabel: string;
  summary: string;
  hagueConventionMember: string;
  source: { label: string; url: string }[];
  lastCheckedDate: string;
  caveat: string;
}

export const APOSTILLE_DISCLAIMER =
  "Please check the documents required to be apostilled based on your own country or region — requirements can differ from the general guideline below for some countries. What's shown here is the general requirement as stated in the official NIIED guidelines. This is a starting reference, not a substitute for checking your own country's embassy or consulate notice: requirements can change between application cycles, and some countries have confirmed additional steps or exceptions (see the country-specific notes below the tables).";

export const APOSTILLE_GENERAL_DEFAULT: Record<Track, ApostilleGeneralDefault> = {
  gks_g: {
    summary: [
      "Authentication only ever applies at the second round of selection (NIIED) — never at the first round, where each embassy or university sets its own (usually lighter) submission rules.",
      "Which authentication you need is a hard branch on Hague Apostille Convention membership: if your country is a member, you must obtain an apostille — consular confirmation is not offered as an alternative. If your country is not a member, or the document genuinely cannot be apostilled, you must obtain consular confirmation from the Korean embassy or consulate covering your country instead.",
      "A plain original with no authentication, a document notarized only by a notary public, or a document confirmed only by some other non-apostille, non-consular government agency are all explicitly rejected. The only exception is documents issued by the Korean government itself, submitted as-is.",
      "Documents not in English or Korean also need a certified translation — the apostille or consular confirmation is required on either the original document or the translation, not necessarily both.",
      "An apostille obtained in the past can't be resubmitted as a plain photocopy — it must be a certified true copy from the original issuing agency, or a certified true copy issued by a Korean embassy.",
      "Authenticated documents are valid for 2 years from the authentication date if no expiration date is printed on them.",
      "If you graduated from a third country, obtain an apostille if that country is a Hague member, or check whether that country's own embassy/consulate can issue a consular confirmation if not.",
      "UNHCR-referred refugee applicants have an explicit exception: proof of citizenship/family relationship may be a UNHCR-issued Refugee Card or Certificate instead, and if apostille/consular confirmation genuinely can't be obtained for graduation/transcript documents, a UNHCR-issued recommendation letter may substitute.",
    ],
    documentsRequiringAuthentication: {
      note: "From the official guideline's Embassy Track document table (p.16). Required/Optional is shown per degree level, since it genuinely differs — e.g. a Master's Graduation Certificate is required for Doctoral applicants but not applicable for Master's applicants. University Track's table (p.17) is nearly identical, with a third Research-track column; ask if you need that level of detail.",
      gksG: [
        { no: "11", name: "Proof of Citizenship and family relationship document (applicant and parents)", masters: "Required", doctoral: "Required" },
        { no: "12", name: "Bachelor's Graduation Certificate (or Diploma)", masters: "Required", doctoral: "Required" },
        { no: "12'", name: "Bachelor's Degree Transcript", masters: "Required", doctoral: "Required" },
        { no: "13", name: "Master's Graduation Certificate (or Diploma)", masters: "N/A", doctoral: "Required" },
        { no: "13'", name: "Master's Degree Transcript", masters: "N/A", doctoral: "Required" },
        { no: "14", name: "Doctoral Graduation Certificate (or Diploma) — postdoctoral research applicants only", masters: "N/A", doctoral: "N/A" },
        { no: "14'", name: "Doctoral Degree Transcript — postdoctoral research applicants only", masters: "N/A", doctoral: "N/A" },
        { no: "15", name: "Certificate of Employment — research-track professionals only", masters: "N/A", doctoral: "N/A" },
        { no: "16", name: "Proof of Overseas Korean / Korean Adoptee Document", masters: "Optional", doctoral: "Optional" },
        { no: "17", name: "Proof of Korean Citizenship Renunciation Document", masters: "Optional", doctoral: "Optional" },
        { no: "18", name: "Proof of Korean War Veteran's Descendant", masters: "Optional", doctoral: "Optional" },
        { no: "19", name: "Certificate of Employment or Experience", masters: "Optional", doctoral: "Optional" },
      ],
    },
    documentsNotRequiringAuthentication: {
      forms: [
        "Application Form",
        "Personal Statement",
        "Study Plan",
        "Research Proposal (research program applicants)",
        "Letter of Recommendation",
        "Letter of Invitation (research program applicants)",
        "Korean Language Program Exemption Application (current academic professors)",
        "GKS Applicant Agreement",
        "Personal Medical Assessment",
        "Consent to Collect and Use Personal Information",
      ],
      otherOptional: ["TOPIK/TOPIK IBT or English Proficiency Test score report", "Awards and other certificates", "Passport copy"],
    },
    sources: [{ label: "2026 GKS-G Application Guidelines (official NIIED PDF), p.16–17 and p.62–64", url: "https://gksscholarship.com/wp-content/uploads/2026/02/2026-GKS-G-Application-Guidelines-English.pdf" }],
    lastCheckedDate: "2026-07-29",
  },
  gks_u: {
    summary: [
      "Authentication only ever applies at the second round of selection (NIIED) — never at the first round, where each embassy or university sets its own (usually lighter) submission rules.",
      "Which authentication you need is a hard branch on Hague Apostille Convention membership: member countries need an apostille, non-member countries (or documents that genuinely can't be apostilled) need consular confirmation from the Korean embassy or consulate covering your country.",
      "A plain original with no authentication, a document notarized only by a notary public, or a document confirmed only by some other non-apostille, non-consular government agency are all explicitly rejected. The only exception is documents issued by the Korean government itself.",
      "Documents not in English or Korean also need a certified translation — the apostille or consular confirmation is required on either the original document or the translation, not necessarily both.",
      "The guideline was revised mid-cycle after an October 2025 fire at NIIED, adding a third selection round. That changed how many authenticated copies Embassy-track applicants submit: General/Overseas-Korean applicants now submit 1 original + 3 extra photocopies, R-GKS applicants 1 original + 2 extra copies, and University-track applicants 1 original — the document types required didn't change, only the copy count.",
    ],
    documentsRequiringAuthentication: {
      note: "From the official guideline's 'Documents to Submit' table (p.11) — confirmed identical between the original and the revised (currently active) guideline versions.",
      gksU: [
        { no: "7", name: "Proof of citizenship (applicant and parents) and proof of family relationship", requirement: "Required" },
        { no: "8", name: "High School Graduation Certificate (or certificate of expected graduation)", requirement: "Required" },
        { no: "9", name: "Academic transcript of high school curriculum", requirement: "Required" },
        { no: "10", name: "Graduation certificate (or certificate of expected graduation) of associate degree program", requirement: "Optional" },
        { no: "11", name: "Academic transcript of associate degree", requirement: "Optional" },
        { no: "12", name: "Proof of Overseas Korean Document", requirement: "Optional" },
        { no: "13", name: "Proof of Korean Citizenship Renunciation Document", requirement: "Optional" },
        { no: "14", name: "Proof of Korean War Veteran's Descendant", requirement: "Optional" },
      ],
    },
    documentsNotRequiringAuthentication: {
      forms: ["Application Form", "Personal Statement", "Study Plan", "Recommender's Information + sealed Recommendation Letter", "GKS Applicant Agreement", "Personal Medical Assessment"],
      otherOptional: ["TOPIK or English Proficiency Test score report", "Awards and other certificates", "Passport copy"],
    },
    sources: [
      { label: "2026 GKS-U Application Guidelines, revised version (currently active), p.11", url: "/official-guidelines/gks-u-2026-revised.pdf" },
      { label: "2026 GKS-U Application Guidelines, original version, p.11", url: "/official-guidelines/gks-u-2026-original.pdf" },
    ],
    lastCheckedDate: "2026-07-29",
  },
};

export const APOSTILLE_COUNTRY_OVERRIDES: CountryOverride[] = [
  {
    country: "Nepal",
    embassyOrConsulate: "Embassy of the Republic of Korea in Nepal",
    trackLabel: "GKS-G and GKS-U",
    summary:
      "Before the interview round, all required certificates must first be attested by Nepal's own Ministry of Foreign Affairs (MoFA) — this comes before the general default's apostille/consular-confirmation step, not instead of it. Non-English/Korean documents need MoFA attestation plus a certified translation. Only after passing the interview does the Korean Embassy in Nepal perform consular confirmation of those same certificates — two separate authentication stages, tied to two different selection outcomes. The notice also includes a crisis exception: if an applicant genuinely can't obtain MoFA attestation given recent conditions in Nepal, non-certified documents may be submitted instead.",
    hagueConventionMember: "No",
    source: [
      { label: "Embassy of Korea in Nepal — 2026 GKS-G notice", url: "https://np.mofa.go.kr/np-en/brd/m_25533/view.do?seq=164" },
      { label: "Embassy of Korea in Nepal — 2026 GKS-U notice", url: "https://overseas.mofa.go.kr/np-en/brd/m_25533/view.do?seq=151" },
    ],
    lastCheckedDate: "2026-07-25",
    caveat:
      "Requirements can change between application cycles and may differ by circumstance. Always confirm current requirements with your embassy's official GKS notice before starting the authentication process.",
  },
  {
    country: "Bangladesh",
    embassyOrConsulate: "Embassy of the Republic of Korea in Bangladesh",
    trackLabel: "GKS-G (not separately confirmed for GKS-U)",
    summary:
      "A genuine exception to the general default, not just a local process detail: birth, family-relation, and educational certificates need an E-Apostille issued by Bangladesh's own Ministry of Foreign Affairs. The notice explicitly states consular confirmation by the Korean Embassy in Bangladesh is NOT required on top of the E-Apostille — the E-Apostille alone is sufficient here. The E-Apostille cover sheet must be scanned together with the underlying certificate; the cover sheet alone is not accepted. Certificates issued outside Bangladesh still need their own proper attestation from wherever they were issued.",
    hagueConventionMember: "Yes (implied by E-Apostille availability)",
    source: [{ label: "Embassy of Korea in Bangladesh — 2026 GKS-G notice", url: "https://www.mofa.go.kr/bd-en/brd/m_2124/view.do?seq=760090" }],
    lastCheckedDate: "2026-07-25",
    caveat:
      "Requirements can change between application cycles and may differ by circumstance. Always confirm current requirements with your embassy's official GKS notice before starting the authentication process.",
  },
  {
    country: "Myanmar",
    embassyOrConsulate: "Embassy of the Republic of Korea in the Republic of the Union of Myanmar",
    trackLabel: "GKS-U (sourced from a 2025-cycle notice — confirm against the 2026 notice directly)",
    summary:
      "The general default's 'apostille or consular confirmation' becomes a specific three-step chain in practice: (1) notarization at a public notary office, (2) legalization of that notarized document by Myanmar's own MOFA, (3) presenting the legalized original, a photocopy, and a passport photocopy to the Korean Embassy's consular section for final confirmation. At the first-round application stage itself, none of this is required yet — but original documents with English notarization were described as mandatory even at that first stage for the undergraduate track.",
    hagueConventionMember: "No",
    source: [{ label: "Embassy of Korea in Myanmar — GKS-U notice (2025 cycle)", url: "https://overseas.mofa.go.kr/mm-en/brd/m_2088/view.do?seq=760471" }],
    lastCheckedDate: "2026-07-25",
    caveat:
      "This entry is sourced from a 2025-cycle notice — confirm against the current 2026 notice directly before relying on it. Requirements can change between cycles.",
  },
];
