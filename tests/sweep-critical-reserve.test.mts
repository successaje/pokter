import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runBudget } from '../src/lib/history/budget';
import { SWEEP_CRITICAL_RESERVE_MS, SWEEP_CRITICAL_STEP_MS, SWEEP_RUN_BUDGET_MS } from '../src/lib/history/schedule';

function fakeClock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
}
const CRITICAL = { critical: true as const, maxMs: SWEEP_CRITICAL_STEP_MS };

test('a slow ordinary step cannot starve a critical one', async () => {
  /*
   * The run of 21 October. `reconcileJobs` was handed the whole remainder
   * and used it, and the four steps after it — which detect hires, retry
   * stuck deliveries and tell sellers — were skipped by arithmetic while the
   * run reported 200.
   */
  const clock = fakeClock();
  const budget = runBudget(240_000, clock.now, SWEEP_CRITICAL_RESERVE_MS);

  await budget.step('reconcileJobs', () => { clock.advance(200_000); return 'spent it all'; });

  const ran: string[] = [];
  for (const label of ['hireWatch', 'deliveryRetries', 'sellerNotices', 'stuckJobs']) {
    const result = await budget.step(label, () => { clock.advance(1_000); ran.push(label); return label; }, CRITICAL);
    assert.equal(result, label, `${label} must still run`);
  }

  assert.deepEqual(ran, ['hireWatch', 'deliveryRetries', 'sellerNotices', 'stuckJobs']);
  assert.deepEqual(budget.report().criticalMissed, []);
});

test('one hanging critical step does not starve the other critical steps', async () => {
  /*
   * The flaw in reserving time without capping each claim on it. A shared
   * 40s reservation is consumed entirely by the first critical step that
   * hangs, and the remaining three are skipped — the original fault with the
   * victims narrowed from eighteen steps to three.
   */
  const clock = fakeClock();
  const budget = runBudget(240_000, clock.now, SWEEP_CRITICAL_RESERVE_MS);
  await budget.step('reconcileJobs', () => { clock.advance(200_000); return 'ordinary time gone'; });

  // hireWatch hangs: the budget stops waiting at its own cap, not at the
  // end of the reservation.
  const hung = await budget.step('hireWatch', () => {
    clock.advance(SWEEP_CRITICAL_STEP_MS);
    return new Promise(() => {});
  }, CRITICAL);
  assert.equal(hung, null, 'the hanging step is given up on');

  const survived: string[] = [];
  for (const label of ['deliveryRetries', 'sellerNotices', 'stuckJobs']) {
    const result = await budget.step(label, () => { clock.advance(500); survived.push(label); return label; }, CRITICAL);
    assert.equal(result, label, `${label} must survive a hanging hireWatch`);
  }
  assert.deepEqual(survived, ['deliveryRetries', 'sellerNotices', 'stuckJobs']);

  const report = budget.report();
  assert.deepEqual(report.timedOut, ['hireWatch']);
  assert.deepEqual(report.criticalMissed, ['hireWatch'], 'one loss, named, and only one');
});

test('an ordinary step cannot spend the reservation', async () => {
  const clock = fakeClock();
  const budget = runBudget(240_000, clock.now, 40_000);
  assert.equal(budget.spendable(), 200_000);
  assert.equal(budget.remaining(), 240_000);

  clock.advance(200_000);
  assert.equal(budget.spendable(), 0, 'ordinary time is gone');
  assert.equal(budget.remaining(), 40_000, 'the reservation is untouched');

  assert.equal(await budget.step('listings', () => 'no'), null);
  assert.equal(await budget.step('hireWatch', () => 'yes', { critical: true }), 'yes');
  assert.deepEqual(budget.report().skipped, ['listings']);
});

test('a critical step lost any of three ways is named', async () => {
  // Skipped, timed out, or thrown: in every case the hire was not detected,
  // so in every case the run did not do its job.
  const clock = fakeClock();
  const budget = runBudget(10_000, clock.now, 9_000);

  await budget.step('deliveryRetries', () => { clock.advance(1_000); return new Promise(() => {}); }, { critical: true, maxMs: 1_000 });
  await budget.step('sellerNotices', () => { throw new Error('smtp refused'); }, { critical: true, maxMs: 1_000 });
  clock.advance(10_000);
  await budget.step('stuckJobs', () => 'never', { critical: true });

  const report = budget.report();
  assert.deepEqual(report.timedOut, ['deliveryRetries']);
  assert.deepEqual(report.failed, ['sellerNotices']);
  assert.deepEqual(report.skipped, ['stuckJobs']);
  assert.deepEqual(report.criticalMissed, ['deliveryRetries', 'sellerNotices', 'stuckJobs']);
});

test('unfinished work cannot reach into a later run', async () => {
  /*
   * `withTimeout` bounds the waiting and not the promise, so a step the
   * budget gave up on may still settle — possibly after the next run has
   * begun. What must not happen is that late settle counting towards the
   * new run, or re-opening the old one's report.
   */
  const clockA = fakeClock();
  const budgetA = runBudget(1_000, clockA.now, 0);
  let release: (v: string) => void = () => {};
  const abandoned = new Promise<string>((resolve) => { release = resolve; });

  assert.equal(await budgetA.step('reconcileJobs', () => abandoned), null, 'given up on');
  const reportBefore = budgetA.report();

  // The next run starts while the old work is still in flight.
  const clockB = fakeClock(10_000);
  const budgetB = runBudget(1_000, clockB.now, 0);
  await budgetB.step('reconcileJobs', () => 'this run did it');

  // And now the abandoned work finally finishes.
  release('too late');
  await abandoned;

  assert.deepEqual(budgetB.report().steps, [{ label: 'reconcileJobs', ms: 0, outcome: 'ok' }]);
  assert.equal(budgetB.report().timedOut.length, 0, 'the new run is unaffected');
  assert.deepEqual(budgetA.report(), reportBefore, 'and the old report did not change after the fact');
});

test('the reservation leaves a healthy run untouched', () => {
  // Runs were finishing in 185–193s of 240s. A reservation that bit in that
  // case would trade a rare failure for a constant one.
  assert.equal(SWEEP_RUN_BUDGET_MS - SWEEP_CRITICAL_RESERVE_MS, 200_000);
  assert.ok(200_000 > 193_000, 'the slowest observed healthy run still fits');
  assert.equal(SWEEP_CRITICAL_STEP_MS, 10_000, 'a quarter of the reservation each');
});

test('the tail is still shed from the bottom', async () => {
  // The behaviour this must not undo: optional work at the end is what goes.
  const clock = fakeClock();
  const budget = runBudget(100_000, clock.now, 10_000);
  await budget.step('measurements', () => { clock.advance(90_000); return 'ok'; });
  for (const label of ['listings', 'funders', 'questIndex']) {
    assert.equal(await budget.step(label, () => label), null);
  }
  assert.deepEqual(budget.report().skipped, ['listings', 'funders', 'questIndex']);
  assert.deepEqual(budget.report().criticalMissed, []);
});
