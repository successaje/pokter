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

test('an attempt is identified by when it started, so a late settle loses', () => {
  /*
   * The hole the previous version left, and the reason its stale-write test
   * was misleading: it hand-passed an old timestamp, while the real worker
   * stamped `new Date()` at completion.
   *
   * Run A starts a job at 12:00 and hangs. Run B attempts the same job at
   * 12:10 and records it. Run A settles at 12:15. Stamped at completion its
   * write is 12:15 — newer than 12:10 — so the store's monotonic guard
   * accepts it and the stale result wins. Stamped at start it is 12:00, and
   * the guard does what it was written for.
   */
  const runAStarted = '2026-10-21T12:00:00.000Z';
  const runASettled = '2026-10-21T12:15:00.000Z';
  const runBAttempt = '2026-10-21T12:10:00.000Z';

  const stampedAtCompletion = afterAttempt(undefined, 'ok', runASettled);
  assert.ok(stampedAtCompletion.lastAttemptedAt! > runBAttempt, 'would beat the newer run');

  const stampedAtStart = afterAttempt(undefined, 'ok', runAStarted);
  assert.ok(stampedAtStart.lastAttemptedAt! < runBAttempt, 'and is correctly older');
});

test('a slow read cannot smuggle a side effect past the deadline', async () => {
  /*
   * The exact sequence: the loop checks the clock, then awaits a chain read
   * that returns after the deadline, then submits. A check at the top of the
   * loop says nothing about the moment before the write, which is why the
   * loop asks twice.
   */
  const { mayStartSideEffect } = await import('../src/lib/history/budget');
  const deadline = 10_000;

  assert.equal(mayStartSideEffect(deadline, 9_000), true, 'top of the loop: time to start');
  // ... the escrow read takes two seconds and returns past the deadline ...
  assert.equal(mayStartSideEffect(deadline, 11_000), false, 'before submitting: no longer');

  // Exactly at the deadline is not "still time".
  assert.equal(mayStartSideEffect(deadline, 10_000), false);
  // And no deadline keeps the behaviour every existing caller had.
  assert.equal(mayStartSideEffect(undefined, Number.MAX_SAFE_INTEGER), true);
});

test('a hire watch that could not read the counter is not a success', async () => {
  /*
   * `HireWatchResult.counter` is documented as "null when the counter could
   * not be read; never zero as a stand-in". A run that cannot see how many
   * jobs exist cannot have detected a new hire, yet it returns without
   * throwing and was recorded as `ok`.
   */
  assert.equal(classifyStageResult('hireWatch', { counter: null, sightings: [], alerted: false }), 'failed');
  assert.equal(classifyStageResult('hireWatch', { counter: '1412', sightings: [], alerted: false }), null);
});

test('the log and the store report the same lost stage', async () => {
  /*
   * They did not. `persistStageOutcomes` refined a stage from its result and
   * returned the budget's report untouched, so a stage whose every delivery
   * failed was stored as `failed` and left out of `criticalMissed` — and
   * `MAINTENANCE INCOMPLETE`, which reads that field, stayed silent about
   * what the store had just recorded.
   */
  const { withClassifiedOutcomes } = await import('../src/lib/history/stage-classify');
  const { CRITICAL_STAGES } = await import('../src/lib/history/schedule');

  const report = {
    steps: [
      { label: 'deliveryRetries', ms: 400, outcome: 'ok' as const },
      { label: 'hireWatch', ms: 90, outcome: 'ok' as const },
      { label: 'listings', ms: 50, outcome: 'ok' as const },
    ],
    skipped: [], timedOut: [], failed: [], criticalMissed: [],
    usedMs: 1_000, budgetMs: 240_000, reservedMs: 40_000,
  };

  const classified = withClassifiedOutcomes(report, {
    deliveryRetries: [{ jobId: '1', action: 'failed', reason: 'relay refused' }],
    hireWatch: { counter: null },
    listings: [],
  }, CRITICAL_STAGES);

  assert.deepEqual(classified.criticalMissed.sort(), ['deliveryRetries', 'hireWatch'], 'both named for the log');
  assert.ok(classified.failed.includes('deliveryRetries'));
  assert.ok(classified.failed.includes('hireWatch'));
  assert.ok(!classified.criticalMissed.includes('listings'), 'an ordinary stage is not maintenance');
  // A clean run stays clean, so the signal does not cry wolf.
  assert.deepEqual(withClassifiedOutcomes(report, { deliveryRetries: [{ action: 'delivered' }], hireWatch: { counter: '9' } }, CRITICAL_STAGES).criticalMissed, []);
});

test('the critical list and the steps marked critical cannot drift apart', async () => {
  /*
   * Two lists would drift, and a stage quietly ceasing to be critical is the
   * failure this whole change is about. Read from the route's source, the
   * way the data-paths test reads the Dockerfile.
   */
  const { readFileSync } = await import('node:fs');
  const { CRITICAL_STAGES } = await import('../src/lib/history/schedule');
  const route = readFileSync('src/app/api/sweep/route.ts', 'utf8');
  const marked = [...route.matchAll(/budget\.step\(\s*'([a-zA-Z]+)'[\s\S]{0,200}?critical: true/g)].map((m) => m[1]);
  assert.deepEqual([...marked].sort(), [...CRITICAL_STAGES].sort());
});

test('a partial clears the read-failure streak and restores the normal cadence', async () => {
  /*
   * The streak backs off a row whose *escrow read* fails. A partial proves
   * the read now works — the state was fetched and only the notification
   * after it failed — so carrying the streak forward would keep a row that
   * had failed ten times waiting six hours for a read that has started
   * succeeding, delaying reconciliation to punish a bounced email.
   *
   * Leaving the count untouched is the obvious implementation and the wrong
   * one; this is the regression that catches it.
   */
  const { backoffMs, isDue, RETRY_BASE_MS, RETRY_CEILING_MS } = await import('../src/lib/history/reconcile-schedule');

  // Ten consecutive unreadable attempts: fully backed off.
  const stuck = { lastAttemptedAt: '2026-10-21T06:00:00.000Z', lastSucceededAt: '2026-10-19T08:00:00.000Z', failures: 10 };
  assert.equal(backoffMs(stuck.failures), RETRY_CEILING_MS, 'six hours before the chain read started working');

  // Now the chain read succeeds and the notification fails.
  const after = afterAttempt(stuck, 'partial', '2026-10-21T12:00:00.000Z');

  assert.equal(after.failures, 0, 'the read-failure streak is cleared');
  assert.equal(backoffMs(after.failures), 0, 'and with it the six-hour wait');
  assert.equal(
    after.lastSucceededAt,
    '2026-10-19T08:00:00.000Z',
    'while nothing claims the job succeeded — the builder still was not told',
  );
  assert.equal(after.lastAttemptedAt, '2026-10-21T12:00:00.000Z', 'and the turn was spent');

  // Back to the ordinary cadence: eligible on the next run rather than in six
  // hours. A sweep ten minutes later may pick it up.
  const tenMinutesOn = Date.parse('2026-10-21T12:10:00.000Z');
  assert.equal(isDue(after, tenMinutesOn), true, 'due again on the next sweep');
  /*
   * The counterfactual, stated as one: the same row at the same moment, had
   * the streak been carried forward instead of cleared. Comparing against
   * the original `stuck` would prove nothing — its last attempt was 06:00,
   * so by 12:10 its six hours had elapsed anyway.
   */
  const keptStreak = { ...after, failures: 10 };
  assert.equal(isDue(keptStreak, tenMinutesOn), false, 'had the streak been kept, it would still be waiting');

  // And a further read failure starts the streak from one, not from eleven.
  const relapsed = afterAttempt(after, 'failed', '2026-10-21T12:10:00.000Z');
  assert.equal(relapsed.failures, 1);
  assert.equal(backoffMs(relapsed.failures), RETRY_BASE_MS, 'ten minutes, not six hours');
});

test('only an unreadable escrow increments the streak', async () => {
  // The invariant behind the test above, stated once: anything that read the
  // chain resets, and only a failure to read it counts.
  const ten = { lastAttemptedAt: '2026-10-21T06:00:00.000Z', lastSucceededAt: null, failures: 10 };
  assert.equal(afterAttempt(ten, 'ok', '2026-10-21T12:00:00.000Z').failures, 0);
  assert.equal(afterAttempt(ten, 'partial', '2026-10-21T12:00:00.000Z').failures, 0);
  assert.equal(afterAttempt(ten, 'failed', '2026-10-21T12:00:00.000Z').failures, 11);
});

test('stuck jobs that nobody was told about is not a success', async () => {
  /*
   * `stuck-alert.ts` reports an unsent alert "as `alerted: false` beside the
   * count rather than as success", and the budget was recording `ok` because
   * nothing threw — so the stage that exists to raise the alarm could fail
   * to raise it and read as healthy.
   */
  const channels = { telegram: true, email: true, any: true };
  assert.equal(classifyStageResult('stuckJobs', { checked: 9, stuck: 2, alerted: false, jobIds: ['1', '2'], channels }), 'failed');
  assert.equal(classifyStageResult('stuckJobs', { checked: 9, stuck: 2, alerted: true, jobIds: ['1', '2'], channels }), null, 'alerted is fine');
  assert.equal(classifyStageResult('stuckJobs', { checked: 9, stuck: 0, alerted: false, jobIds: [], channels }), null, 'nothing stuck is fine');

  // With no channel configured, `alerted: false` is a deployment state. A
  // signal that fires on configuration teaches everyone to ignore it.
  const none = { telegram: false, email: false, any: false };
  assert.equal(classifyStageResult('stuckJobs', { checked: 9, stuck: 2, alerted: false, jobIds: ['1'], channels: none }), null);
});

test('an unreachable seller notice is a failure, a rejection is not', () => {
  /*
   * `SellerNoticeStatus` is `accepted | rejected | unreachable`. Only the
   * last is a failure of this stage: a seller that rejected the job was
   * asked and answered, which is the notice doing its work. Classifying a
   * rejection as failure would make the signal fire on sellers declining,
   * which is ordinary business.
   */
  assert.equal(classifyStageResult('sellerNotices', [
    { jobId: '1', chainId: 56, status: 'rejected' },
    { jobId: '2', chainId: 56, status: 'accepted' },
  ]), null, 'asked and answered, either way');

  assert.equal(classifyStageResult('sellerNotices', [
    { jobId: '1', chainId: 56, status: 'unreachable' },
    { jobId: '2', chainId: 56, status: 'unreachable' },
  ]), 'failed', 'nobody was reached');

  assert.equal(classifyStageResult('sellerNotices', [
    { jobId: '1', chainId: 56, status: 'accepted' },
    { jobId: '2', chainId: 56, status: 'unreachable' },
  ]), 'partial');

  // Nothing due is not a failure.
  assert.equal(classifyStageResult('sellerNotices', []), null);
});

test('a notice attempt that threw is exposed rather than swallowed', () => {
  /*
   * The catch pushed nothing, so a run in which every notice threw returned
   * an empty array — indistinguishable from a run with nothing to do. It now
   * pushes `failed: true`, kept distinct from `status: 'unreachable'`, which
   * is a seller that answered nothing rather than a notice never completed.
   */
  assert.equal(classifyStageResult('sellerNotices', [
    { jobId: '1', chainId: 56, status: 'unreachable', failed: true },
  ]), 'failed');

  assert.equal(classifyStageResult('sellerNotices', [
    { jobId: '1', chainId: 56, status: 'accepted' },
    { jobId: '2', chainId: 56, status: 'unreachable', failed: true },
  ]), 'partial', 'one landed, one never completed');
});

test('an alert skipped for lack of time reads as maintenance not done', async () => {
  /*
   * The deadline guard leaves the alert unsent, which surfaces as
   * `alerted: false`. That must classify as a failure rather than disappear
   * — the stage exists to raise the alarm, and not raising it is the thing
   * worth knowing.
   */
  const channels = { telegram: true, email: true, any: true };
  assert.equal(
    classifyStageResult('stuckJobs', { checked: 4, stuck: 2, alerted: false, jobIds: ['1', '2'], channels }),
    'failed',
    'stuck jobs and no alert sent',
  );
});
