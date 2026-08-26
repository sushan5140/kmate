import type { RequirementDataset, RequirementRecord, StructuredRule } from "./schema";

export type CheckerInput = {
  program: "GKS-U" | "GKS-G";
  trackFamily?: string;
  university?: string;
  major?: string;
  gender?: "female" | "male" | "other" | "prefer_not_to_say";
};

export type CheckerResult = {
  record: RequirementRecord;
  verdict: "verified" | "conditional" | "not_stated" | "unavailable";
  matchedRules: StructuredRule[];
  notes: string[];
};

const norm = (v?: string) => (v ?? "").trim().toLowerCase();

function ruleMatches(rule: StructuredRule, input: CheckerInput): boolean {
  if (rule.field === "major" && rule.operator === "equals") {
    return !!input.major && norm(input.major) === norm(rule.value);
  }
  if (rule.field === "gender" && rule.operator === "equals") {
    return !!input.gender && norm(input.gender) === norm(rule.value);
  }
  if (rule.field === "gender_major_restriction") {
    return input.gender === "male";
  }
  if (rule.field === "extra_document" && rule.operator === "required_if") {
    // UI should evaluate the condition using the selected normalized major/college.
    return !!input.major && norm(input.major).includes("maritime");
  }
  return false;
}

export function checkRequirements(
  dataset: RequirementDataset,
  input: CheckerInput
): CheckerResult[] {
  const candidates = dataset.records.filter((r) => {
    if (r.program !== input.program) return false;
    if (input.university && norm(r.university) !== norm(input.university)) return false;
    if (input.trackFamily && !r.track_families.includes(input.trackFamily)) return false;
    return true;
  });

  return candidates.map((record) => {
    if (record.verification.level === "excluded" || record.flags.excluded) {
      return { record, verdict: "unavailable", matchedRules: [], notes: ["Explicitly excluded by verified source."] };
    }

    const matchedRules = record.structured_rules.filter((rule) => ruleMatches(rule, input));
    const notes: string[] = [];

    if (record.flags.details_withheld) {
      notes.push("Some university-specific details are withheld because the official source did not state them clearly.");
    }
    if (!record.requirements.language) notes.push("Language requirement not stated.");
    if (!record.requirements.majors_departments) notes.push("Major/department requirement not stated.");

    let verdict: CheckerResult["verdict"] = "verified";
    if (record.verification.level === "not_stated") verdict = "not_stated";
    else if (record.verification.level === "partial" || record.flags.details_withheld) verdict = "conditional";

    // Safety rule: absence of a structured match must never be treated as ineligibility.
    // It means only that the dataset cannot make a hard eligibility claim.
    return { record, verdict, matchedRules, notes };
  });
}
