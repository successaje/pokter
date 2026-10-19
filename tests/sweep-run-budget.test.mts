import assert from 'node:assert/strict';
import test from 'node:test';

import { runBudget } from '../src/lib/history/budget';

/** A clock the test moves by hand, so none of this waits on real time. */
function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1_000;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('a step runs while there is time and is skipped once there is not', async () => {
  const clock = fakeClock();
  const budget = runBudget(1_000, clock.now);
  const ran: string[] = [];

  assert.equal(await budget.step('first', () => { ran.push('first'); return 1; }), 1);

  clock.advance(1_000);
  assert.equal(budget.spent(), true);
  assert.equal(await budget.step('second', () => { ran.push('second'); return 2; }), null);

  assert.deepEqual(ran, ['first'], 'a skipped step is not called at all');
  assert.deepEqual(budget.report().skipped, ['second']);
});

test('the measurements survive a run that is cut short', async () => {
  // The property the ordering exists for: the route puts its slow optional
  // work last, so a spent budget sheds the tail and keeps the sweep.
  const clock = fakeClock();
  const budget = runBudget(500, clock.now);

  const measured = await budget.step('sweep', () => {
    clock.advance(600); // the sweep alone used the whole run
    return { probes: 42 };
  });

  assert.deepEqual(measured, { probes: 42 }, 'the step that overran still returns its result');
  assert.equal(await budget.step('seals', () => 'sealed'), null);
  assert.equal(await budget.step('funders', () => 'funded'), null);
  assert.deepEqual(budget.report().skipped, ['seals', 'funders']);
});

test('a step may not outlive the run, and says so', async () => {
  const budget = runBudget(40);
  // Longer than the whole budget: the step is abandoned, not awaited.
  const out = await budget.step('slow', () => new Promise((resolve) => setTimeout(() => resolve('late'), 400)));

  assert.equal(out, null);
  assert.deepEqual(budget.report().timedOut, ['slow']);
  assert.deepEqual(budget.report().skipped, [], 'it started, so it was not skipped');
});

test('a step gets what remains, not an allowance of its own', async () => {
  // Twenty-five steps with a budget each is how the run came to have none.
  const clock = fakeClock();
  const budget = runBudget(1_000, clock.now);

  clock.advance(900);
  assert.equal(budget.remaining(), 100);
  clock.advance(50);
  assert.equal(budget.remaining(), 50, 'the allowance shrinks as the run proceeds');
  clock.advance(500);
  assert.equal(budget.remaining(), 0, 'and never goes negative');
});

test('a failing step is a gap in the report, never a failed run', async () => {
  const budget = runBudget(1_000);

  assert.equal(await budget.step('throws', () => { throw new Error('upstream is down'); }), null);
  assert.equal(await budget.step('rejects', async () => { throw new Error('rpc refused'); }), null);
  assert.equal(await budget.step('after', () => 'still ran'), 'still ran');

  const report = budget.report();
  assert.deepEqual(report.timedOut, [], 'a failure is not a timeout');
  assert.deepEqual(report.skipped, [], 'nor a skip — it ran and did not work');
});

test('the report says what the run spent against what it was given', async () => {
  const clock = fakeClock();
  const budget = runBudget(5_000, clock.now);
  await budget.step('work', () => { clock.advance(1_200); });

  assert.deepEqual(budget.report(), { skipped: [], timedOut: [], usedMs: 1_200, budgetMs: 5_000 });
});

test('a step that returns null is not mistaken for one that was skipped', async () => {
  // Several of the route's steps legitimately return null; only the report
  // distinguishes those from the ones the budget refused.
  const budget = runBudget(1_000);
  assert.equal(await budget.step('legitimately-null', () => null), null);
  assert.deepEqual(budget.report().skipped, []);
});
