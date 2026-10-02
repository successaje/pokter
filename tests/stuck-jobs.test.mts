import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STUCK_AFTER_MS,
  describeDuration,
  stuckJobsNeedingAlert,
} from '../src/lib/erc8183/stuck-jobs';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const job = (over: Partial<Parameters<typeof stuckJobsNeedingAlert>[0][number]> = {}) => ({
  jobId: '1',
  agentName: 'Agent',
  fundedAtMs: NOW - 2 * 60 * 60 * 1000,
  expiresAtMs: NOW + 22 * 60 * 60 * 1000,
  statusName: 'FUNDED',
  ...over,
});

test('a job funded within the hour is not yet stuck', () => {
  const fresh = job({ fundedAtMs: NOW - (STUCK_AFTER_MS - 1) });
  assert.deepEqual(stuckJobsNeedingAlert([fresh], NOW, new Set()), []);

  const exactly = job({ fundedAtMs: NOW - STUCK_AFTER_MS });
  assert.equal(
    stuckJobsNeedingAlert([exactly], NOW, new Set()).length,
    1,
    'the hour mark itself counts',
  );
});

test('only funded jobs are stuck — delivered and settled ones are not', () => {
  const states = ['SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'];
  for (const statusName of states) {
    assert.deepEqual(
      stuckJobsNeedingAlert([job({ statusName })], NOW, new Set()),
      [],
      `${statusName} should not alert`,
    );
  }
});

/*
 * An expired job is past saving. Alerting on it would report a fire after
 * the building has gone, every sweep, forever.
 */
test('an expired job is not raised — it is the buyer\'s to reclaim', () => {
  const gone = job({ expiresAtMs: NOW - 1 });
  assert.deepEqual(stuckJobsNeedingAlert([gone], NOW, new Set()), []);
});

test('a job already alerted is not raised again', () => {
  const stuck = job({ jobId: '77' });
  assert.equal(stuckJobsNeedingAlert([stuck], NOW, new Set()).length, 1);
  assert.deepEqual(
    stuckJobsNeedingAlert([stuck], NOW, new Set(['77'])),
    [],
    'the sweep runs every two hours; one job must not send twelve messages a day',
  );
});

test('the most urgent job is reported first', () => {
  const soon = job({ jobId: 'soon', expiresAtMs: NOW + 60 * 60 * 1000 });
  const later = job({ jobId: 'later', expiresAtMs: NOW + 20 * 60 * 60 * 1000 });
  assert.deepEqual(
    stuckJobsNeedingAlert([later, soon], NOW, new Set()).map((j) => j.jobId),
    ['soon', 'later'],
  );
});

test('it reports how long is left, not just how long it has been', () => {
  const [only] = stuckJobsNeedingAlert(
    [job({ fundedAtMs: NOW - 3 * 60 * 60 * 1000, expiresAtMs: NOW + DAY })],
    NOW,
    new Set(),
  );
  assert.equal(describeDuration(only.stuckForMs), '3h');
  assert.equal(describeDuration(only.remainingMs), '24h');
});

test('durations read for a human', () => {
  assert.equal(describeDuration(0), '0m');
  assert.equal(describeDuration(45 * 60_000), '45m');
  assert.equal(describeDuration(60 * 60_000), '1h');
  assert.equal(describeDuration(200 * 60_000), '3h 20m');
});
