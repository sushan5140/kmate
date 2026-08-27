import type {
  ApplicantDocumentProgress,
  ReadinessChecklistDataset,
  ReadinessInput,
  ReadinessItem,
  ReadinessResult,
} from "./schema";

type RequirementRecordLike = {
  university: string;
  program: "GKS-U" | "GKS-G";
  track_families: string[];
  requirements: {
    process_extra_documents: string | null;
  };
  structured_rules: Array<{
    field: string;
    operator: string;
    value: string;
    condition?: string;
    scope: string;
    effect: string;
    evidence: string;
  }>;
  verification: {
    level: "verified" | "partial" | "not_stated" | "excluded";
  };
  sources: string[];
};

const byId = (progress: ApplicantDocumentProgress[] = []) =>
  new Map(progress.map((p) => [p.document_id, p]));

const sourceMap = (dataset: ReadinessChecklistDataset) =>
  new Map(dataset.official_sources.map((s) => [s.id, s.url]));

function requirementRecordMatches(
  record: RequirementRecordLike,
  input: ReadinessInput
): boolean {
  if (record.program !== input.program) return false;
  if (input.university && record.university.toLowerCase() !== input.university.toLowerCase()) {
    return false;
  }
  if (input.trackFamily && !record.track_families.includes(input.trackFamily)) {
    return false;
  }
  return record.verification.level !== "excluded";
}

function universityExtras(
  records: RequirementRecordLike[],
  input: ReadinessInput
): ReadinessItem[] {
  if (!input.university) return [];

  const matching = records.filter((r) => requirementRecordMatches(r, input));
  const extras: ReadinessItem[] = [];

  for (const record of matching) {
    const process = record.requirements.process_extra_documents?.trim();
    if (process) {
      extras.push({
        id: `university-extra:${record.university}:${record.track_families.join("+")}:process`,
        label: "University / track-specific process or extra documents",
        category: "university_extra",
        status: record.verification.level === "verified" ? "conditional" : "not_stated",
        notes: process,
        sourceUrls: record.sources,
        origin: "university_requirement",
        progress: "untracked",
      });
    }

    for (const rule of record.structured_rules) {
      if (rule.field !== "extra_document") continue;

      const major = (input.selectedMajor ?? "").toLowerCase();
      const conditionText = (rule.condition ?? "").toLowerCase();
      let applies = false;

      if (!rule.condition) applies = true;
      else if (major && conditionText.includes("maritime") && major.includes("maritime")) applies = true;

      extras.push({
        id: `university-rule:${record.university}:${rule.value}`,
        label: rule.value,
        category: "university_extra",
        status: applies ? "required" : "conditional",
        condition: rule.condition,
        notes: rule.evidence,
        sourceUrls: record.sources,
        origin: "university_requirement",
        progress: "untracked",
      });
    }
  }

  // Same verified fact can exist in complementary records. De-dupe only exact identical item payloads.
  const seen = new Set<string>();
  return extras.filter((item) => {
    const key = JSON.stringify([
      item.label,
      item.status,
      item.condition ?? "",
      item.notes ?? "",
      [...item.sourceUrls].sort(),
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildReadinessResult(
  checklist: ReadinessChecklistDataset,
  requirementRecords: RequirementRecordLike[],
  input: ReadinessInput
): ReadinessResult {
  const progress = byId(input.applicantDocumentProgress);
  const sources = sourceMap(checklist);

  const core: ReadinessItem[] = checklist.programs[input.program].documents.map((doc) => ({
    id: doc.id,
    label: doc.label,
    category: doc.category,
    status: doc.status,
    condition: doc.condition,
    notes: doc.notes,
    sourceUrls: doc.source_ids.map((id) => sources.get(id)).filter((v): v is string => Boolean(v)),
    origin: "gks_core",
    progress: progress.get(doc.id)?.state ?? "untracked",
  }));

  const extras = universityExtras(requirementRecords, input).map((item) => ({
    ...item,
    progress: progress.get(item.id)?.state ?? item.progress,
  }));

  const items = [...core, ...extras];
  const required = items.filter((i) => i.status === "required");
  const requiredReady = required.filter((i) => i.progress === "ready").length;
  const requiredMissing = required.filter((i) => i.progress === "missing").length;

  const trackedRequired = required.filter((i) => i.progress !== "untracked").length;
  const completionPercent =
    trackedRequired === 0 ? null : Math.round((requiredReady / required.length) * 100);

  const warnings = [
    "Submission method and document authentication can differ by embassy, university, issuing country, and document type. Always follow the current first-round institution notice.",
    "A missing university-specific rule means “not stated in the verified source,” not “no requirement.”",
  ];

  if (!input.university) {
    warnings.push("Select a university to add verified university-specific process and extra-document requirements.");
  }

  return {
    program: input.program,
    university: input.university,
    items,
    summary: {
      required_total: required.length,
      required_ready: requiredReady,
      required_missing: requiredMissing,
      conditional_total: items.filter((i) => i.status === "conditional").length,
      optional_total: items.filter((i) => i.status === "optional").length,
      completion_percent: completionPercent,
    },
    warnings,
  };
}
