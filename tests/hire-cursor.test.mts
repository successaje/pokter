import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mayAdvanceHireCursor } from '../src/lib/alerts/hire-cursor';
import { classifyStageResult } from '../src/lib/history/stage-classify';
import { runBudget } from '../src/lib/history/budget';
import { SWEEP_CRITICAL_RESERVE_MS, SWEEP_CRITICAL_STEP_MS } from '../src/lib/history/schedule';

const CHANNELS = { telegram: true, email: true, any: true };

test('an outside hire survives a deadline that stopped its alert', async () => {
  /*
   * Two runs, driven through the cursor the watch actually keeps. A
   * classifier test cannot show this: the question is not how the run is
   * labelled but whether the hire is still there next time.
   *
   * The deadline guard made the alert skippable, and the cursor advanced
   * regardless — so the hires it had just found were never read again. Not
   * delayed, gone.
   */
  const COUNTER = 1_412;
  let cursor = 1_409;
  // Job 1410 is from outside the team; 1411 and 1412 are the team's own.
  const outsidersAfter = (from: number) => [1_410].filter((id) => id > from).length;

  // --- run one: the hire is found, and the alert is stopped by the deadline.
  const runOneOutsiders = outsidersAfter(cursor);
  assert.equal(runOneOutsiders, 1, 'the outside hire is discovered');
  const runOneAlerted = false; // mayStartSideEffect said no
  if (mayAdvanceHireCursor({ outsiders: runOneOutsiders, alerted: runOneAlerted })) {
    cursor = COUNTER;
  }
  assert.equal(cursor, 1_409, 'the cursor did not move past an unannounced hire');
  assert.equal(
    classifyStageResult('hireWatch', { counter: String(COUNTER), outsiders: runOneOutsiders, alerted: runOneAlerted, channels: CHANNELS }),
    'failed',
    'and the run is reported as maintenance that did not complete',
  );

  // --- run two: with time to send, the same hire is still found and alerted.
  const runTwoOutsiders = outsidersAfter(cursor);
  assert.equal(runTwoOutsiders, 1, 'the next run still finds it');
  const runTwoAlerted = true;
  if (mayAdvanceHireCursor({ outsiders: runTwoOutsiders, alerted: runTwoAlerted })) {
    cursor = COUNTER;
  }
  assert.equal(cursor, COUNTER, 'and now the cursor may move');
  assert.equal(
    classifyStageResult('hireWatch', { counter: String(COUNTER), outsiders: runTwoOutsiders, alerted: runTwoAlerted, channels: CHANNELS }),
    null,
    'a run that told somebody is clean',
  );

  // --- run three: nothing new, so the cursor advances as it always did.
  assert.equal(outsidersAfter(cursor), 0);
  assert.equal(mayAdvanceHireCursor({ outsiders: 0, alerted: false }), true, 'nothing found is nothing owed');
});

test('an unconfigured channel is not a failed hire alert', () => {
  // `alerted: false` with no channel is a deployment state. A signal that
  // fires on configuration teaches everyone to ignore it.
  const none = { telegram: false, email: false, any: false };
  assert.equal(classifyStageResult('hireWatch', { counter: '9', outsiders: 2, alerted: false, channels: none }), null);
  assert.equal(classifyStageResult('hireWatch', { counter: '9', outsiders: 2, alerted: false, channels: CHANNELS }), 'failed');
});

test('a zero reserve skips every critical stage, so it is not a rollback', async () => {
  /*
   * Recorded so nobody reaches for it. `SWEEP_CRITICAL_STEP_MS` is a quarter
   * of the reserve, so a reserve of zero gives each critical step a cap of
   * zero, and `step` skips at a cap of zero. That does not restore the
   * previous behaviour — it disables hire detection, delivery retries,
   * seller notices and stuck-job alerts outright.
   */
  assert.equal(SWEEP_CRITICAL_RESERVE_MS / 4, SWEEP_CRITICAL_STEP_MS, 'the cap is derived from the reserve');

  const zeroBudget = runBudget(240_000, () => 0, 0);
  const ran: string[] = [];
  const result = await zeroBudget.step('hireWatch', () => { ran.push('hireWatch'); return 'ok'; }, { critical: true, maxMs: 0 });
  assert.equal(result, null, 'skipped, not run');
  assert.deepEqual(ran, [], 'the work never happened');
  assert.deepEqual(zeroBudget.report().criticalMissed, ['hireWatch']);
});
