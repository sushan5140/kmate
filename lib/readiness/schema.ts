export type ReadinessStatus = "required" | "conditional" | "optional" | "not_stated";
export type ReadinessCategory =
  | "gks_form"
  | "academic"
  | "certificate"
  | "identity"
  | "supporting"
  | "authentication"
  | "university_extra";

export interface ReadinessDocumentRule {
  id: string;
  label: string;
  category: ReadinessCategory;
  status: ReadinessStatus;
  form?: string;
  condition?: string;
  notes?: string;
  source_ids: string[];
}

export interface ReadinessSource {
  id: string;
  label: string;
  url: string;
  scope: string;
}

export interface ReadinessChecklistDataset {
  schema_version: string;
  cycle: string;
  dataset: string;
  policy: {
    never_treat_missing_as_not_required: boolean;
    submission_method_is_first_round_institution_specific: boolean;
    authentication_rules_can_be_country_specific: boolean;
    university_extras_must_come_from_requirement_checker: boolean;
    status_values: ReadinessStatus[];
  };
  official_sources: ReadinessSource[];
  programs: {
    "GKS-U": { documents: ReadinessDocumentRule[] };
    "GKS-G": { documents: ReadinessDocumentRule[] };
  };
}

export type ApplicantDocumentState = "ready" | "in_progress" | "missing" | "not_applicable";

export interface ApplicantDocumentProgress {
  document_id: string;
  state: ApplicantDocumentState;
  note?: string;
}

export interface ReadinessInput {
  program: "GKS-U" | "GKS-G";
  university?: string;
  selectedMajor?: string;
  trackFamily?: string;
  subtype?: string;
  applicantDocumentProgress?: ApplicantDocumentProgress[];
}

export interface ReadinessItem {
  id: string;
  label: string;
  category: ReadinessCategory;
  status: ReadinessStatus;
  condition?: string;
  notes?: string;
  sourceUrls: string[];
  origin: "gks_core" | "university_requirement";
  progress: ApplicantDocumentState | "untracked";
}

export interface ReadinessResult {
  program: "GKS-U" | "GKS-G";
  university?: string;
  items: ReadinessItem[];
  summary: {
    required_total: number;
    required_ready: number;
    required_missing: number;
    conditional_total: number;
    optional_total: number;
    completion_percent: number | null;
  };
  warnings: string[];
}
