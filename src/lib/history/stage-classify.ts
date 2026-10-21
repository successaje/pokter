import type { RunBudgetReport } from './budget';
import type { StageOutcome } from './maintenance-store';

/*
 * Pure, and separate from the persistence beside it for the reason the
 * sweep schedule is separate from its store: a module that imports
 * `server-only` cannot be imported by a test, and these two functions are
 * the part worth holding to one. The first version of them lived in
 * `stage-outcomes.ts` and could not be tested at all.
 */

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
 * Whether what a stage returned shows it actually did its job.
 *
 * The budget records `ok` when a step does not throw, which is all it can
 * know. But `deliveryRetries` returns an outcome per delivery and catches
 * its own failures by design — "a failure here is reported and left for the
 * next sweep" — so a run in which every retry failed returns normally and
 * was being recorded as a success. That is the same mistake as a sweep
 * reporting 200 while skipping the steps that notify people.
 *
 * Only stages whose shape is known are inspected. Anything else keeps the
 * budget's answer, because inventing a reading of an unknown shape would be
 * worse than the honest "it did not throw".
 */
export function classifyStageResult(label: string, value: unknown): StageOutcome | null {
  if (label === 'deliveryRetries' && Array.isArray(value)) {
    const attempted = value.filter((r): r is { action: string } => typeof r === 'object' && r !== null && 'action' in r);
    const failed = attempted.filter((r) => r.action === 'failed').length;
    if (failed === 0) return null;
    /* Some delivered and some did not: the stage ran and did not finish its
       work, which is neither a success nor a failure to run. */
    const delivered = attempted.filter((r) => r.action === 'delivered').length;
    return delivered > 0 ? 'partial' : 'failed';
  }
  return null;
}

