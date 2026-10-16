import assert from 'node:assert/strict';
import test from 'node:test';

import { HF_COMPARABLE_MS, artifactReadAt, gradePaidHfScenario } from '../src/lib/assay/paid-hf-grade';
import { hfCheckBrief } from '../src/lib/assay/paid-brief';
import { readCheckMarker } from '../src/lib/assay/paid-brief';
import { HF_SUITE_ID } from '../src/lib/assay/health-factor';

const ACCOUNT = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';
const READ_AT = '2026-10-15T12:00:00.000Z';

/** A Brinkwatch-shaped report: the answer plus the block it was read at. */
const artifact = (healthFactor: number | null, asOf: string | null, liquidatable = false) =>
  JSON.stringify({
    response: {
      content: JSON.stringify({
        account: ACCOUNT,
        health_factor: healthFactor,
        liquidatable,
        ...(asOf ? { as_of: { block: '127800000', time: asOf } } : {}),
      }),
    },
  });

test('a health-factor fixture names the account as its scenario', () => {
  const built = hfCheckBrief(ACCOUNT);
  assert.ok(built);
  assert.deepEqual(readCheckMarker(built.task), { suite: HF_SUITE_ID, scenario: ACCOUNT.toLowerCase() });
  // The account must reach the agent, which reads the chain itself.
  assert.ok(built.task.includes(ACCOUNT));
  assert.equal(hfCheckBrief('not-an-address'), null);
});

test('the time the agent says it read the position is recovered', () => {
  assert.equal(artifactReadAt(artifact(1.5, READ_AT)), READ_AT);
  assert.equal(artifactReadAt(artifact(1.5, null)), null);
  assert.equal(artifactReadAt('not json'), null);
});

test('an answer matching Venus passes', () => {
  const result = gradePaidHfScenario({
    account: ACCOUNT, jobId: '77', manifestText: artifact(1.5, READ_AT),
    reading: { healthFactor: 1.5, borrowLimitRatio: 1.3, liquidatable: false }, readAt: READ_AT,
  });
  assert.equal(result.pass, true);
  assert.equal(result.jobId, '77');
});

test('readings far apart in time count neither way', () => {
  /*
   * A correctness page must not publish a failure that belongs to the
   * clock, and by the same reasoning must not publish a pass a stale answer
   * earned by matching a position that did not move.
   */
  const stale = new Date(Date.parse(READ_AT) - HF_COMPARABLE_MS - 60_000).toISOString();

  const staleWrong = gradePaidHfScenario({
    account: ACCOUNT, jobId: '1', manifestText: artifact(9.9, stale),
    reading: { healthFactor: 1.5, borrowLimitRatio: 1.3, liquidatable: false }, readAt: READ_AT,
  });
  assert.equal(staleWrong.pass, false);
  assert.equal(staleWrong.outcome, 'not-comparable', 'a moved position is not the agent’s error');

  const freshWrong = gradePaidHfScenario({
    account: ACCOUNT, jobId: '2', manifestText: artifact(9.9, READ_AT),
    reading: { healthFactor: 1.5, borrowLimitRatio: 1.3, liquidatable: false }, readAt: READ_AT,
  });
  assert.equal(freshWrong.outcome, 'wrong', 'read at the same moment, the disagreement is the agent’s');

  // Agreeing with a reading taken long after is not a pass either.
  const staleRight = gradePaidHfScenario({
    account: ACCOUNT, jobId: '3', manifestText: artifact(1.5, stale),
    reading: { healthFactor: 1.5, borrowLimitRatio: 1.3, liquidatable: false }, readAt: READ_AT,
  });
  assert.equal(staleRight.pass, false);
  assert.equal(staleRight.outcome, 'not-comparable');
  assert.match(staleRight.reason, /not counted either way/);

  const freshRight = gradePaidHfScenario({
    account: ACCOUNT, jobId: '5', manifestText: artifact(1.5, READ_AT),
    reading: { healthFactor: 1.5, borrowLimitRatio: 1.3, liquidatable: false }, readAt: READ_AT,
  });
  assert.equal(freshRight.pass, true);

  // No stated read time: the disagreement cannot be attributed either.
  const undated = gradePaidHfScenario({
    account: ACCOUNT, jobId: '4', manifestText: artifact(9.9, null),
    reading: { healthFactor: 1.5, borrowLimitRatio: 1.3, liquidatable: false }, readAt: READ_AT,
  });
  assert.equal(undated.outcome, 'not-comparable');
});

test('the borrowing-limit confusion is never excused by drift', () => {
  /*
   * Answering the borrowing-limit ratio instead of the liquidation-threshold
   * one is a definitional error that a moving position cannot explain, and
   * it is the most useful thing this check finds.
   */
  const stale = new Date(Date.parse(READ_AT) - 6 * 60 * 60 * 1000).toISOString();
  const result = gradePaidHfScenario({
    account: ACCOUNT, jobId: '5', manifestText: artifact(1.3, stale),
    reading: { healthFactor: 1.5, borrowLimitRatio: 1.3, liquidatable: false }, readAt: READ_AT,
  });
  assert.equal(result.outcome, 'borrow-limit');
  assert.equal(result.pass, false);
});

test('undelivered and unreadable stay distinct from wrong', () => {
  const reading = { healthFactor: 1.5, borrowLimitRatio: 1.3, liquidatable: false };
  assert.equal(gradePaidHfScenario({ account: ACCOUNT, jobId: '6', manifestText: null, reading, readAt: READ_AT }).outcome, 'undelivered');
  assert.equal(gradePaidHfScenario({ account: ACCOUNT, jobId: '7', manifestText: '{}', reading, readAt: READ_AT }).outcome, 'unreadable');
  // Pokter unable to read Venus is Pokter's gap, not the agent's failure.
  assert.equal(gradePaidHfScenario({ account: ACCOUNT, jobId: '8', manifestText: artifact(1.5, READ_AT), reading: null, readAt: READ_AT }).outcome, 'not-comparable');
});

test('a funded health-factor fixture inside its window is pending', () => {
  const reading = { healthFactor: 1.5, borrowLimitRatio: 1.3, liquidatable: false };
  const pending = gradePaidHfScenario({ account: ACCOUNT, jobId: '1460', manifestText: null, reading, readAt: READ_AT, deliveryOpen: true });
  assert.equal(pending.outcome, 'pending');
  const closed = gradePaidHfScenario({ account: ACCOUNT, jobId: '1460', manifestText: null, reading, readAt: READ_AT, deliveryOpen: false });
  assert.equal(closed.outcome, 'undelivered');
});
