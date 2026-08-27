import "server-only";
import checklistJson from "@/data/readiness-checklist-data.json";
import requirementJson from "@/data/requirement-checker-data.json";
import { buildReadinessResult } from "./engine";
import { subtypeEvidence, trackEvidence } from "@/lib/requirements/options";
import type { ReadinessChecklistDataset, ReadinessInput, ReadinessResult } from "./schema";
import type { RequirementDataset } from "@/lib/requirements/schema";
import type { ApplicationReadiness, UniversitySection } from "./application";

/**
 * Application Readiness data layer.
 *
 * Files, as delivered:
 *   kmate_readiness_checklist_data.json -> data/readiness-checklist-data.json
 *   kmate_readiness_schema.ts           -> lib/readiness/schema.ts
 *   kmate_readiness_engine.ts           -> lib/readiness/engine.ts
 *   kmate_readiness_index.ts            -> this file
 *
 * The checklist dataset holds the national GKS document rules only. Every
 * university-specific extra comes from the Requirement Checker dataset, which
 * this module reads but never writes -- nothing here copies a university rule
 * into the readiness JSON, and nothing parses university prose into a hard
 * requirement.
 *
 * `server-only` for the same reason lib/requirements/options.ts carries it:
 * requirement-checker-data.json is 338 KB and must never reach the client
 * bundle. The engine itself stays free of it so the checks can import it
 * directly under plain tsx.
 */

const checklist = checklistJson as unknown as ReadinessChecklistDataset;
const requirements = requirementJson as unknown as RequirementDataset;

export function getApplicationReadiness(input: ReadinessInput): ReadinessResult {
  // Track scoping is applied HERE rather than left to the engine's own
  // `trackFamily` filter, so readiness and the Requirement Checker agree on
  // what "Embassy Track" means. The engine's filter tests the raw
  // track_families list; the checker's hierarchy is two-level and treats a
  // record naming only R&D or Global Network as University Track, while
  // withholding participation-only records from both routes entirely. Running
  // the raw filter here would surface extras from a route the applicant did
  // not choose and reintroduce the flat-family model the checker moved away
  // from -- so the records are pre-scoped and `trackFamily` is left unset,
  // which makes the engine's filter a no-op. One hierarchy, one source of
  // truth; the engine is otherwise untouched.
  const records = input.trackFamily
    ? requirements.records.filter((record) => {
        if (!trackEvidence(record, input.trackFamily!).matches) return false;
        return input.subtype
          ? subtypeEvidence(record, input.subtype, input.trackFamily!).matches
          : true;
      })
    : requirements.records;

  const { trackFamily: _scoped, ...rest } = input;
  void _scoped;
  return buildReadinessResult(checklist, records, rest);
}

/**
 * The multi-university workspace.
 *
 * The national checklist is built ONCE, from the program alone, and every
 * selected university contributes only its own `university_extra` items. That
 * is what stops the 13-document undergraduate checklist being rendered three
 * times over, and it needs no new logic: it is the same engine call the
 * single-university page made, with the national half taken from the
 * university-less result and the university half taken per university.
 *
 * Each university is scoped independently by program + track + program type +
 * that university + that university's own major, so one university's
 * requirements can never appear under another's, and two applicants' slots
 * pointing at different departments evaluate their conditional rules
 * separately.
 */
export function getApplicationWorkspace(input: {
  program: "GKS-U" | "GKS-G";
  track?: string;
  subtype?: string;
  universities: { name: string; major: string }[];
}): ApplicationReadiness {
  const national = getApplicationReadiness({ program: input.program });
  const common = national.items.filter((i) => i.category !== "university_extra");

  const universities: UniversitySection[] = input.universities.map(({ name, major }) => {
    const scoped = getApplicationReadiness({
      program: input.program,
      university: name,
      ...(input.track ? { trackFamily: input.track } : {}),
      ...(input.subtype ? { subtype: input.subtype } : {}),
      ...(major ? { selectedMajor: major } : {}),
    });
    return {
      university: name,
      major,
      // Only this university's own extras. The national documents were already
      // taken from the university-less result above.
      items: scoped.items.filter((i) => i.category === "university_extra"),
    };
  });

  // The engine's standing warnings belong to the application as a whole. Its
  // "select a university" warning is dropped once one has been chosen, since
  // the workspace answers it.
  const warnings = national.warnings.filter(
    (w) => universities.length === 0 || !w.startsWith("Select a university")
  );

  return { common, universities, warnings };
}

export { checklist as readinessChecklist };
