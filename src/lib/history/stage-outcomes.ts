import 'server-only';

import { getMaintenanceStore } from './maintenance-store';
import type { RunBudgetReport } from './budget';
import { classifyStageResult, stageOutcomes, withClassifiedOutcomes } from './stage-classify';
import { CRITICAL_STAGES } from './schedule';

/**
 * Write how each stage ended, and hand the report back for the response.
 *
 * Swallowing everything, for the reason the saturation record does: this is
 * bookkeeping on the end of a run that has already done its work, and a
 * failure to write it must not turn a successful sweep into a 500. A lost
 * row costs a gap in the history; a throw here would cost the run.
 */
export function persistStageOutcomes(
  report: RunBudgetReport,
  results: Record<string, unknown> = {},
  at = new Date().toISOString(),
): RunBudgetReport {
  const classified = withClassifiedOutcomes(report, results, CRITICAL_STAGES);
  try {
    const store = getMaintenanceStore();
    for (const { label, outcome } of stageOutcomes(report)) {
      /* The budget knows whether a step threw; only the result knows whether
         it did the work. Where the shape is known, the result wins — and the
         same answer is returned below, so the log and the store agree. */
      const refined = outcome === 'ok' ? classifyStageResult(label, results[label]) : null;
      store.noteStage(label, refined ?? outcome, at);
    }
  } catch (error) {
    console.warn(`[sweep] could not record stage outcomes: ${(error as Error).message}`);
  }
  return classified;
}
