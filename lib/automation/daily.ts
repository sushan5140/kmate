import "server-only";
import { runNoticeScout } from "@/lib/notices/scout";
import { runScholarshipDiscovery, runScholarshipFreshness } from "@/lib/scholarships/discovery";
import { runDeadlineAssistant } from "@/lib/assistant/run";
import { recordRun } from "./health";

/**
 * The single scheduled job.
 *
 * Four stages that previously wanted four cron entries. Collapsing them into
 * one orchestrator removes the deployment-plan dependency entirely -- Vercel's
 * Hobby tier allows two daily crons, and declaring three would have failed at
 * deploy time on that plan. One entry works everywhere.
 *
 * Order is load-bearing, not cosmetic:
 *   1. notice scout            discovers notices and queues them for review
 *   2. scholarship discovery   writes scholarship rows, including deadlines
 *   3. scholarship freshness   ages those rows -- must see step 2's writes
 *   4. deadline assistant      proposes from notices a human has approved
 *
 * Every stage is isolated. A stage that throws is recorded and the run
 * continues, because these stages are independent in the only direction that
 * matters: none of them needs an earlier one to have SUCCEEDED, only to have
 * finished. Freshness on a day discovery failed simply re-evaluates yesterday's
 * rows, which is correct -- skipping it would leave expired scholarships
 * visible, a worse outcome than acting on slightly older data.
 */

export interface StageResult {
  stage: string;
  ok: boolean;
  ms: number;
  error: string | null;
  stats: Record<string, unknown>;
}

export interface DailyMaintenanceResult {
  ok: boolean;
  stages: StageResult[];
  totalMs: number;
}

type Stage = { name: string; run: () => Promise<object> };

const STAGES: Stage[] = [
  { name: "notice-scout", run: () => runNoticeScout() },
  // Wrapped: discovery returns an array, and automation_runs.stats is a
  // jsonb OBJECT of counters. Keeps the per-source detail without storing a
  // bare array that later readers would have to special-case.
  { name: "scholarships", run: async () => ({ sources: await runScholarshipDiscovery() }) },
  { name: "scholarships-freshness", run: () => runScholarshipFreshness() },
  { name: "deadline-assistant", run: () => runDeadlineAssistant() },
];

/** The stage names, in execution order. Exported so a test can assert it. */
export const DAILY_STAGE_ORDER = STAGES.map((s) => s.name);

export async function runDailyMaintenance(
  trigger: "cron" | "manual" = "cron"
): Promise<DailyMaintenanceResult> {
  const startedAt = Date.now();
  const stages: StageResult[] = [];

  for (const stage of STAGES) {
    const t0 = Date.now();
    // Each stage records its own automation_runs row as well, so the existing
    // per-job health view keeps working exactly as it did when these were
    // separate crons -- the orchestrator is transparent to it.
    const { result, error } = await recordRun(stage.name, trigger, stage.run);
    stages.push({
      stage: stage.name,
      ok: error === null,
      ms: Date.now() - t0,
      error,
      stats: (result ?? {}) as Record<string, unknown>,
    });
  }

  return {
    ok: stages.every((s) => s.ok),
    stages,
    totalMs: Date.now() - startedAt,
  };
}
