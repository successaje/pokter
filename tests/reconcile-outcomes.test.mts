import assert from 'node:assert/strict';
import { test } from 'node:test';

import { afterAttempt, classifyAttempt, type JobAttempt } from '../src/lib/history/reconcile-schedule';
import { classifyStageResult, stageOutcomes } from '../src/lib/history/stage-classify';

const T0 = '2026-10-21T12:00:00.000Z';
const base = (over: Partial<JobAttempt> = {}): JobAttempt =>
  ({ lastAttemptedAt: null, lastSucceededAt: null, failures: 0, ...over });

test('a reconciled job whose notification failed is partial, not a success', () => {
  /*
   * The result the first classifier got wrong. Its escrow state *was* read
   * and its builder was *not* told, so calling it a success and advancing
   * `lastSucceededAt` is the same mistake as a run reporting 200 while
   * skipping the steps that notify people.
   */
  const partial = { sent: 0, reconciled: true, notificationSkipped: false, notificationFailed: true };
  assert.equal(classifyAttempt(partial), 'partial');

  const before = base({ lastSucceededAt: '2026-10-20T09:00:00.000Z', failures: 0 });
  const after = afterAttempt(before, 'partial', T0);
  assert.equal(after.lastAttemptedAt, T0, 'the turn was spent');
  assert.equal(after.lastSucceededAt, '2026-10-20T09:00:00.000Z', 'and nothing claims it succeeded');
  assert.equal(after.failures, 0, 'but a bounced email does not slow reconciliation down');
});

test('every result shape the reconcile task returns is classified', () => {
  // Reconciled, no registry owner to notify: the skip is legitimate.
  assert.equal(classifyAttempt({ sent: 0, reconciled: true, notificationSkipped: true, notificationFailed: false }), 'ok');
  // Reconciled and notified.
  assert.equal(classifyAttempt({ sent: 1, reconciled: true, notificationSkipped: false, notificationFailed: false }), 'ok');
  // Could not read the escrow at all.
  assert.equal(classifyAttempt({ sent: 0, reconciled: false, notificationSkipped: false, notificationFailed: false, unreadable: true }), 'failed');
  // And a shape that claims nothing is not a success.
  assert.equal(classifyAttempt({}), 'failed', 'absence of `reconciled` is not proof of it');
});

test('a null result is not attempted, not a failure', () => {
  /*
   * `mapWithConcurrency` returns an entry per item, and a worker past the
   * deadline returns null. Recording that as a failure would give the job a
   * backoff for work nobody did, and push it behind jobs that have been
   * tried — the opposite of keeping its place.
   */
  assert.equal(classifyAttempt(null), 'not-attempted');
  assert.equal(classifyAttempt(undefined), 'not-attempted');
});

test('a null counter is not read as a successful send', () => {
  /*
   * `sent: email.sent` passes through whatever the mail path returned. A
   * null counter means the number is unknown, and an unknown count must not
   * decide the outcome either way — `reconciled` and `notificationFailed`
   * do that, and they are explicit.
   */
  assert.equal(classifyAttempt({ sent: null, reconciled: true, notificationFailed: false }), 'ok');
  assert.equal(classifyAttempt({ sent: null, reconciled: true, notificationFailed: true }), 'partial');
  assert.equal(classifyAttempt({ sent: null, reconciled: false }), 'failed');
  // And the response counter tolerates it rather than producing NaN.
  const sum = [{ sent: null }, { sent: 2 }, { sent: undefined }].reduce((n, r) => n + (r.sent ?? 0), 0);
  assert.equal(sum, 2);
});

test('a stage whose every delivery retry failed is not recorded as ok', () => {
  /*
   * `retryStuckDeliveries` catches its own failures by design — "a failure
   * here is reported and left for the next sweep" — so it returns normally
   * and the budget records `ok`. A run in which nothing was delivered was
   * being filed as a success.
   */
  assert.equal(classifyStageResult('deliveryRetries', [
    { jobId: '1', action: 'failed', reason: 'relay refused' },
    { jobId: '2', action: 'failed', reason: 'relay refused' },
  ]), 'failed');

  assert.equal(classifyStageResult('deliveryRetries', [
    { jobId: '1', action: 'delivered' },
    { jobId: '2', action: 'failed', reason: 'relay refused' },
  ]), 'partial', 'some through and some not is neither');

  // Nothing to correct: all delivered, or nothing to do.
  assert.equal(classifyStageResult('deliveryRetries', [{ jobId: '1', action: 'delivered' }]), null);
  assert.equal(classifyStageResult('deliveryRetries', [{ jobId: '1', action: 'skipped' }]), null);
  assert.equal(classifyStageResult('deliveryRetries', []), null);

  // A shape this does not know keeps the budget's answer rather than a guess.
  assert.equal(classifyStageResult('hireWatch', { watched: 3 }), null);
  assert.equal(classifyStageResult('deliveryRetries', 'not an array'), null);
});

test('the flattened stage list keeps skipped steps apart from failed ones', () => {
  const outcomes = stageOutcomes({
    steps: [
      { label: 'hireWatch', ms: 120, outcome: 'ok' },
      { label: 'deliveryRetries', ms: 9_000, outcome: 'timed-out' },
      { label: 'sellerNotices', ms: 40, outcome: 'failed' },
    ],
    skipped: ['stuckJobs'],
    timedOut: ['deliveryRetries'],
    failed: ['sellerNotices'],
    criticalMissed: ['deliveryRetries', 'sellerNotices', 'stuckJobs'],
    usedMs: 1_000, budgetMs: 240_000, reservedMs: 40_000,
  });
  assert.deepEqual(outcomes, [
    { label: 'hireWatch', outcome: 'ok' },
    { label: 'deliveryRetries', outcome: 'timed-out' },
    { label: 'sellerNotices', outcome: 'failed' },
    { label: 'stuckJobs', outcome: 'skipped' },
  ]);
});

test('completed progress survives a batch that times out around it', async () => {
  /*
   * The bug this replaced: attempts were recorded after `budget.step`
   * returned, so a batch that timed out returned null, the results were
   * gone, and the jobs that genuinely reconciled before the deadline looked
   * untouched. They would be attempted again next run while the jobs behind
   * them kept waiting — the starvation this change removes, one level down.
   *
   * Recording inside the worker is what fixes it, so the test records as the
   * worker does and then throws the batch away.
   */
  const recorded = new Map<string, JobAttempt>();
  const record = (key: string, result: Parameters<typeof classifyAttempt>[0]) => {
    const outcome = classifyAttempt(result);
    if (outcome === 'not-attempted') return;
    recorded.set(key, afterAttempt(recorded.get(key), outcome, T0));
  };

  const batch = async () => {
    record('56:1', { reconciled: true, notificationFailed: false });          // done
    record('56:2', { reconciled: true, notificationFailed: true });           // partial
    record('56:3', { reconciled: false, unreadable: true });                  // failed
    await new Promise(() => {});                                             // job 4 hangs here
    record('56:4', { reconciled: true });                                     // never reached
  };
  // The batch is abandoned, exactly as the budget abandons a timed-out step.
  await Promise.race([batch(), new Promise((resolve) => setTimeout(resolve, 10))]);

  assert.deepEqual([...recorded.keys()], ['56:1', '56:2', '56:3'], 'three jobs kept their progress');
  assert.equal(recorded.get('56:1')!.lastSucceededAt, T0);
  assert.equal(recorded.get('56:2')!.lastSucceededAt, null, 'the partial did not claim success');
  assert.equal(recorded.get('56:3')!.failures, 1);
  assert.equal(recorded.get('56:4'), undefined, 'and the job never reached keeps its place');
});
