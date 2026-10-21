import 'server-only';

import { getMaintenanceStore, type StageOutcome } from './maintenance-store';
import type { RunBudgetReport } from './budget';

/**
 * Every stage of a run and how it ended, in one list.
 *
 * The report keeps its outcomes in four places — `steps` for the ones that
 * started, and `skipped` for the ones that never did — which is right for a
 * report and wrong for writing down. This flattens them so a stage's history
 * is one row per run with one outcome, and "has `deliveryRetries` succeeded
 * today" is a question the store can answer.
 *
 * Pure, and exported for the test: the derivation is the part worth holding,
 * and persistence below is a loop over it.
 */
export function stageOutcomes(report: RunBudgetReport): Array<{ label: string; outcome: StageOutcome }> {
  return [
    ...report.steps.map((step) => ({ label: step.label, outcome: step.outcome as StageOutcome })),
    ...report.skipped.map((label) => ({ label, outcome: 'skipped' as StageOutcome })),
  ];
}

/**
 * Write how each stage ended, and hand the report back for the response.
 *
 * Swallowing everything, for the reason the saturation record does: this is
 * bookkeeping on the end of a run that has already done its work, and a
 * failure to write it must not turn a successful sweep into a 500. A lost
 * row costs a gap in the history; a throw here would cost the run.
 */
export function persistStageOutcomes(report: RunBudgetReport, at = new Date().toISOString()): RunBudgetReport {
  try {
    const store = getMaintenanceStore();
    for (const { label, outcome } of stageOutcomes(report)) {
      store.noteStage(label, outcome, at);
    }
  } catch (error) {
    console.warn(`[sweep] could not record stage outcomes: ${(error as Error).message}`);
  }
  return report;
}
