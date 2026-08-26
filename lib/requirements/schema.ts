export type GKSProgram = "GKS-U" | "GKS-G";
export type DegreeLevel = "bachelor" | "associate" | "graduate" | "unknown";
export type VerificationLevel = "verified" | "partial" | "not_stated" | "excluded";

export interface StructuredRule {
  field: string;
  operator: "equals" | "conditional" | "required_if";
  value: string;
  condition?: string;
  scope: string;
  effect: "required" | "restrict";
  evidence: string;
}

export interface RequirementRecord {
  id: string;
  university: string;
  program: GKSProgram;
  degree_level: DegreeLevel;
  track_label: string;
  track_families: string[];
  university_type: "A" | "B" | null;
  requirements: {
    majors_departments: string | null;
    language: string | null;
    process_extra_documents: string | null;
  };
  structured_rules: StructuredRule[];
  verification: {
    level: VerificationLevel;
    status: string | null;
    last_verified: string | null;
  };
  flags: {
    embassy_only: boolean;
    uic: boolean;
    english_track: boolean;
    associate_degree: boolean;
    r_gks: boolean;
    rd: boolean;
    global_network: boolean;
    excluded: boolean;
    details_withheld: boolean;
  };
  sources: string[];
}

export interface RequirementDataset {
  schema_version: string;
  dataset: string;
  cycle: string;
  generated_from: string;
  record_count: number;
  matching_policy: {
    never_infer_missing_requirement: boolean;
    unknown_result: "not_stated";
    partial_result: "conditional";
    source_priority: string[];
  };
  records: RequirementRecord[];
}
