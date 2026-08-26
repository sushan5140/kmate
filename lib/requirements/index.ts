/**
 * University Requirement Checker data layer.
 *
 * Wires the frozen dataset to the matcher. Nothing here interprets, edits or
 * fills in requirement data -- the dataset is committed exactly as delivered
 * and this module only types it and hands it to `checkRequirements`.
 *
 * Files, as delivered:
 *   KMate_University_Requirements_AppReady.xlsx -> data/reference/ (source of truth, not imported)
 *   kmate_requirement_checker_data.json         -> data/requirement-checker-data.json
 *   kmate_requirement_checker_schema.ts         -> lib/requirements/schema.ts
 *   kmate_requirement_checker_matcher.ts        -> lib/requirements/matcher.ts
 *
 * No UI yet -- this is the data layer only.
 */
import raw from "@/data/requirement-checker-data.json";
import type { RequirementDataset, RequirementRecord } from "./schema";
import { checkRequirements, type CheckerInput, type CheckerResult } from "./matcher";

/**
 * TypeScript widens the literals in an imported JSON file to `string`, so the
 * union-typed fields (program, degree_level, verification.level, ...) cannot
 * be assigned directly however correct the data is. The cast is checked rather
 * than assumed: `validateRequirementDataset()` below verifies every one of
 * those unions against the real file, and the integration check runs it.
 */
export const requirementDataset = raw as unknown as RequirementDataset;

/** Convenience wrapper so callers don't have to thread the dataset through. */
export function checkUniversityRequirements(input: CheckerInput): CheckerResult[] {
  return checkRequirements(requirementDataset, input);
}

const PROGRAMS = new Set(["GKS-U", "GKS-G"]);
const DEGREE_LEVELS = new Set(["bachelor", "associate", "graduate", "unknown"]);
const VERIFICATION_LEVELS = new Set(["verified", "partial", "not_stated", "excluded"]);
const UNIVERSITY_TYPES = new Set(["A", "B"]);
const OPERATORS = new Set(["equals", "conditional", "required_if"]);
const EFFECTS = new Set(["required", "restrict"]);

/**
 * Checks the shipped JSON really does satisfy the declared schema.
 *
 * Returns a list of problems, empty when the dataset is sound. Deliberately
 * not run at import time: it walks every record, and the dataset is frozen, so
 * paying that on every cold start would buy nothing. Call it from a test or a
 * one-off check instead.
 */
export function validateRequirementDataset(
  dataset: RequirementDataset = requirementDataset
): string[] {
  const problems: string[] = [];

  if (!Array.isArray(dataset.records)) {
    return ["records is not an array"];
  }
  if (dataset.record_count !== dataset.records.length) {
    problems.push(`record_count ${dataset.record_count} != ${dataset.records.length} records`);
  }

  const seen = new Set<string>();
  dataset.records.forEach((record: RequirementRecord, i: number) => {
    const at = `record[${i}] ${record.id ?? "<no id>"}`;
    if (!record.id) problems.push(`${at}: missing id`);
    else if (seen.has(record.id)) problems.push(`${at}: duplicate id`);
    else seen.add(record.id);

    if (!PROGRAMS.has(record.program)) problems.push(`${at}: bad program ${record.program}`);
    if (!DEGREE_LEVELS.has(record.degree_level)) problems.push(`${at}: bad degree_level ${record.degree_level}`);
    if (record.university_type !== null && !UNIVERSITY_TYPES.has(record.university_type)) {
      problems.push(`${at}: bad university_type ${record.university_type}`);
    }
    if (!VERIFICATION_LEVELS.has(record.verification?.level)) {
      problems.push(`${at}: bad verification.level ${record.verification?.level}`);
    }
    if (!Array.isArray(record.track_families)) problems.push(`${at}: track_families is not an array`);
    if (!Array.isArray(record.sources)) problems.push(`${at}: sources is not an array`);
    if (typeof record.requirements !== "object" || record.requirements === null) {
      problems.push(`${at}: missing requirements`);
    }
    if (typeof record.flags !== "object" || record.flags === null) {
      problems.push(`${at}: missing flags`);
    }

    (record.structured_rules ?? []).forEach((rule, j) => {
      if (!OPERATORS.has(rule.operator)) problems.push(`${at} rule[${j}]: bad operator ${rule.operator}`);
      if (!EFFECTS.has(rule.effect)) problems.push(`${at} rule[${j}]: bad effect ${rule.effect}`);
    });
  });

  return problems;
}

export { checkRequirements };
export type { CheckerInput, CheckerResult };
export type {
  RequirementDataset,
  RequirementRecord,
  StructuredRule,
  GKSProgram,
  DegreeLevel,
  VerificationLevel,
} from "./schema";
