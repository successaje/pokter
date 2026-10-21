import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  RECONCILE_PER_RUN, RETRY_BASE_MS, RETRY_CEILING_MS, afterAttempt, backoffMs,
  dueForReconcile, isDue, type JobAttempt,
} from '../src/lib/history/reconcile-schedule';

const T0 = Date.parse('2026-10-21T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const job = (id: string) => ({ id });
const attempt = (over: Partial<JobAttempt> = {}): JobAttempt =>
  ({ lastAttemptedAt: null, lastSucceededAt: null, failures: 0, ...over });

test('a job that cannot succeed does not block the queue', () => {
  /*
   * The failure this module exists to prevent. Ordering by "least recently
   * succeeded" would put a permanently broken row first for ever — its
   * success time never advances, so it is always the stalest, and the jobs
   * behind it are never reached. The backlog never drains while the
   * scheduler reports progress every run.
   */
  const jobs = [job('broken'), job('a'), job('b')];
  const attempts = new Map<string, JobAttempt>([
    // Tried a moment ago and failed; has never once succeeded.
    ['broken', attempt({ lastAttemptedAt: iso(T0 - 1_000), lastSucceededAt: null, failures: 3 })],
    ['a', attempt({ lastAttemptedAt: iso(T0 - 60 * 60_000), lastSucceededAt: iso(T0 - 60 * 60_000) })],
    ['b', attempt({ lastAttemptedAt: iso(T0 - 30 * 60_000), lastSucceededAt: iso(T0 - 30 * 60_000) })],
  ]);

  const batch = dueForReconcile(jobs, (j) => j.id, attempts, T0, 2);
  assert.deepEqual(batch.map((j) => j.id), ['a', 'b'], 'the healthy jobs get the turns');
  assert.ok(!batch.some((j) => j.id === 'broken'), 'the broken row is in backoff, not at the head');
});

test('a failed attempt still spends the turn', () => {
  /*
   * The ordering key is "least recently attempted", and an attempt counts
   * whether or not it worked — because what it consumed was a turn. A
   * failure must not leave the job looking untried.
   */
  const before = attempt({ lastAttemptedAt: iso(T0 - 99_000), lastSucceededAt: iso(T0 - 99_000), failures: 0 });
  const after = afterAttempt(before, 'failed', iso(T0));

  assert.equal(after.lastAttemptedAt, iso(T0), 'the attempt advanced');
  assert.equal(after.lastSucceededAt, iso(T0 - 99_000), 'the success did not');
  assert.equal(after.failures, 1);
});

test('nothing pretends a failure succeeded', () => {
  // Three failures in a row, and the success timestamp never moves.
  let state = attempt({ lastSucceededAt: iso(T0 - 86_400_000) });
  for (let i = 1; i <= 3; i += 1) {
    state = afterAttempt(state, 'failed', iso(T0 + i));
    assert.equal(state.lastSucceededAt, iso(T0 - 86_400_000), `still a day stale after ${i} failures`);
    assert.equal(state.failures, i);
  }
  // And a success clears the count, so one bad hour is not a long sentence.
  state = afterAttempt(state, 'ok', iso(T0 + 10));
  assert.equal(state.failures, 0);
  assert.equal(state.lastSucceededAt, iso(T0 + 10));
});

test('backoff doubles and is capped', () => {
  assert.equal(backoffMs(0), 0, 'a job that has not failed waits for nothing');
  assert.equal(backoffMs(1), RETRY_BASE_MS);
  assert.equal(backoffMs(2), RETRY_BASE_MS * 2);
  assert.equal(backoffMs(4), RETRY_BASE_MS * 8);
  assert.equal(backoffMs(99), RETRY_CEILING_MS, 'capped, so nothing is abandoned for ever');
  assert.ok(RETRY_CEILING_MS > RETRY_BASE_MS);
});

test('a job in backoff is not due, and becomes due when it elapses', () => {
  const failedOnce = attempt({ lastAttemptedAt: iso(T0), failures: 1 });
  assert.equal(isDue(failedOnce, T0 + RETRY_BASE_MS - 1), false);
  assert.equal(isDue(failedOnce, T0 + RETRY_BASE_MS), true);

  // Never attempted, or an unreadable timestamp, means due now rather than
  // never: a row we cannot reason about should be looked at, not stranded.
  assert.equal(isDue(undefined, T0), true);
  assert.equal(isDue(attempt(), T0), true);
  assert.equal(isDue(attempt({ lastAttemptedAt: 'not-a-date', failures: 9 }), T0), true);
});

test('the batch is bounded and never-attempted jobs come first', () => {
  const jobs = [job('tried-recently'), job('fresh'), job('tried-long-ago')];
  const attempts = new Map<string, JobAttempt>([
    ['tried-recently', attempt({ lastAttemptedAt: iso(T0 - 1_000) })],
    ['tried-long-ago', attempt({ lastAttemptedAt: iso(T0 - 86_400_000) })],
  ]);
  const batch = dueForReconcile(jobs, (j) => j.id, attempts, T0, 10);
  assert.deepEqual(
    batch.map((j) => j.id),
    ['fresh', 'tried-long-ago', 'tried-recently'],
    'never attempted, then stalest attempt',
  );
  assert.equal(dueForReconcile(jobs, (j) => j.id, attempts, T0, 1).length, 1, 'bounded');
  assert.equal(dueForReconcile(jobs, (j) => j.id, attempts, T0, 0).length, 0);
});

test('every job is eventually reached, and the broken one does not starve them', () => {
  /*
   * Fair progress over successive runs, which is the property a bounded
   * batch has to earn. Twelve jobs, three per run, one of them permanently
   * broken: every healthy job must be reconciled, repeatedly, and the run
   * count must stay small.
   */
  const jobs = Array.from({ length: 12 }, (_, i) => job(`job-${String(i).padStart(2, '0')}`));
  const attempts = new Map<string, JobAttempt>();
  const succeeded = new Map<string, number>();

  let now = T0;
  for (let run = 0; run < 8; run += 1) {
    for (const j of dueForReconcile(jobs, (x) => x.id, attempts, now, 3)) {
      const outcome = j.id === 'job-07' ? 'failed' : 'ok';
      attempts.set(j.id, afterAttempt(attempts.get(j.id), outcome, new Date(now).toISOString()));
      if (outcome === 'ok') succeeded.set(j.id, (succeeded.get(j.id) ?? 0) + 1);
    }
    now += 10 * 60_000;
  }

  const healthy = jobs.filter((j) => j.id !== 'job-07');
  for (const j of healthy) {
    assert.ok((succeeded.get(j.id) ?? 0) >= 1, `${j.id} was reconciled at least once`);
  }
  assert.equal(succeeded.get('job-07'), undefined, 'the broken one never succeeded');
  const brokenAttempts = attempts.get('job-07')!;
  assert.ok(brokenAttempts.failures <= 3, `and took few turns, not one per run (${brokenAttempts.failures})`);
});

test('the batch size leaves room for the steps after it', () => {
  // Forty at four concurrent is tens of seconds, not the whole remainder.
  assert.equal(RECONCILE_PER_RUN, 40);
  assert.ok(RECONCILE_PER_RUN < 500, 'bounded well below any plausible job count');
});
