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
  if (label === 'sellerNotices' && Array.isArray(value)) {
    /*
     * `SellerNoticeStatus` is `accepted | rejected | unreachable`, and only
     * the last is a failure of this stage: a seller that rejected the job was
     * asked and answered, which is the notice doing its work. `failed` marks
     * an attempt that threw before reaching anyone — previously swallowed, so
     * a run where every notice threw returned an empty array and read exactly
     * like a run with nothing due.
     */
    const attempted = value.filter((n): n is { status?: unknown; failed?: unknown } => typeof n === 'object' && n !== null);
    const landed = attempted.filter((n) => n.status === 'accepted' || n.status === 'rejected').length;
    const lost = attempted.filter((n) => n.failed === true || n.status === 'unreachable').length;
    if (lost === 0) return null;
    return landed > 0 ? 'partial' : 'failed';
  }
  if (label === 'stuckJobs' && typeof value === 'object' && value !== null && 'stuck' in value) {
    /*
     * `stuck-alert.ts` says it reports an unsent alert "as `alerted: false`
     * beside the count rather than as success" — its author meant this to be
     * visible, and the budget was recording `ok` because nothing threw.
     *
     * Guarded on `channels.any`: with no channel configured, `alerted: false`
     * is a deployment state and not a failure, and a signal that fires on
     * configuration would teach everyone to ignore it.
     */
    const outcome = value as { stuck?: unknown; alerted?: unknown; channels?: { any?: unknown } };
    const stuck = typeof outcome.stuck === 'number' ? outcome.stuck : 0;
    if (stuck > 0 && outcome.alerted !== true && outcome.channels?.any === true) return 'failed';
  }
  if (label === 'hireWatch' && typeof value === 'object' && value !== null && 'counter' in value) {
    /*
     * `HireWatchResult.counter` is documented as "null when the counter
     * could not be read; never zero as a stand-in". So a null counter means
     * the watch could not see how many jobs exist, and a run that cannot
     * read the counter cannot have detected a new hire — it returns without
     * throwing and was being recorded as a success.
     */
    if ((value as { counter: unknown }).counter === null) return 'failed';
  }
  return null;
}

/**
 * The report as it should be read, once results have been classified.
 *
 * The outcome written to the store and the outcome the scheduler logs have
 * to be the same one. They were not: `persistStageOutcomes` refined a stage
 * from its result and then returned the budget's report untouched, so a
 * stage whose every delivery failed was stored as `failed` and omitted from
 * `criticalMissed` — and `MAINTENANCE INCOMPLETE`, which reads that field,
 * stayed silent about the thing the store had just recorded.
 */
export function withClassifiedOutcomes(
  report: RunBudgetReport,
  results: Record<string, unknown>,
  critical: readonly string[],
): RunBudgetReport {
  const refined = new Map<string, StageOutcome>();
  for (const { label, outcome } of stageOutcomes(report)) {
    const classified = outcome === 'ok' ? classifyStageResult(label, results[label]) : null;
    refined.set(label, classified ?? outcome);
  }

  const lost = [...refined.entries()].filter(([, outcome]) => outcome !== 'ok');
  const failed = [...new Set([...report.failed, ...lost.filter(([, o]) => o === 'failed' || o === 'partial').map(([label]) => label)])];
  const criticalMissed = [...new Set([
    ...report.criticalMissed,
    ...lost.filter(([label]) => critical.includes(label)).map(([label]) => label),
  ])];

  return { ...report, failed, criticalMissed };
}

