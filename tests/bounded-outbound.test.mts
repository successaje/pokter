import assert from 'node:assert/strict';
import test from 'node:test';

import { mapWithConcurrency } from '../src/lib/concurrency';
import { TimedOut, withTimeout } from '../src/lib/net/bounded';

/*
 * These two rules are what stood between the site and eight hours down on
 * 19 October. A timeout bounds one call; a cap bounds how many are in
 * flight. Either alone is insufficient: a hundred calls that each honour
 * their budget still arrive together.
 *
 * `mapWithConcurrency` is covered here too. It is the cap the whole
 * recovery leans on and it had no tests of its own, which is how it came
 * to be duplicated during this fix before the duplicate was removed.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('a call that never answers is given up on', async () => {
  await assert.rejects(() => withTimeout(new Promise(() => {}), 'never', 40), TimedOut);
});

test('a call that answers in time is untouched', async () => {
  assert.equal(await withTimeout(Promise.resolve('here'), 'fast', 500), 'here');
});

test('the timer does not keep the process alive after a win', async () => {
  // A cleared timer, not a pending one: this runs on every request.
  const started = Date.now();
  await withTimeout(sleep(5).then(() => 'ok'), 'quick', 5_000);
  assert.ok(Date.now() - started < 1_000);
});

test('a rejection passes through as itself, not as a timeout', async () => {
  await assert.rejects(
    () => withTimeout(Promise.reject(new Error('upstream said no')), 'failing', 500),
    /upstream said no/,
  );
});

test('never more than the cap are in flight at once', async () => {
  let inFlight = 0;
  let peak = 0;
  const items = Array.from({ length: 25 }, (_, i) => i);
  await mapWithConcurrency(items, 4, async (i: number) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await sleep(5);
    inFlight -= 1;
    return i;
  });
  assert.ok(peak <= 4, `peaked at ${peak}, cap was 4`);
  assert.ok(peak > 1, 'it should still run them in parallel');
});

test('results keep the order of the input, not of completion', async () => {
  const out = await mapWithConcurrency([30, 1, 20, 2], 4, async (ms: number) => {
    await sleep(ms);
    return ms;
  });
  assert.deepEqual(out, [30, 1, 20, 2]);
});

test('a task that catches its own failure keeps the answers that arrived', async () => {
  /* The helper itself rejects on an uncaught throw, so callers that must
     survive one bad endpoint catch inside the task. That is the idiom
     `marketplace.ts` uses and the one `delivery-times.ts` now follows. */
  const out = await mapWithConcurrency([1, 2, 3], 2, async (n: number) => {
    try {
      if (n === 2) throw new Error('unreachable');
      return n;
    } catch {
      return null;
    }
  });
  assert.deepEqual(out.filter((n) => n !== null), [1, 3]);
});

test('an uncaught throw rejects, so it cannot pass silently', async () => {
  await assert.rejects(
    () => mapWithConcurrency([1, 2], 2, async (n: number) => {
      if (n === 2) throw new Error('unreachable');
      return n;
    }),
    /unreachable/,
  );
});

test('an empty list does nothing and returns nothing', async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), []);
});

test('a cap larger than the list does not spawn idle workers', async () => {
  let calls = 0;
  await mapWithConcurrency([1, 2], 50, async (n: number) => {
    calls += 1;
    return n;
  });
  assert.equal(calls, 2);
});

/*
 * How `runSweep` bounds itself: a deadline tested at the top of each task.
 *
 * The sweep's budget is not a timeout around the whole run — it cannot be,
 * because a run must record what it has already measured. It works by
 * refusing to start further work once the clock is spent, which only bounds
 * the run if `mapWithConcurrency` hands out work as slots free up rather than
 * starting everything at once. These two tests are that property.
 */
test('work past a spent deadline is dropped rather than started', async () => {
  const deadline = Date.now() + 40;
  let measured = 0;
  let dropped = 0;

  await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 2, async () => {
    if (Date.now() >= deadline) {
      dropped += 1;
      return null;
    }
    measured += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return 'done';
  });

  assert.ok(measured > 0, 'the run measured something before the budget ran out');
  assert.ok(dropped > 0, 'and stopped starting work once it had');
  assert.equal(measured + dropped, 20, 'every item was accounted for either way');
});

test('a run already in flight is not interrupted by the deadline', async () => {
  // The four agents in flight when the budget expires still finish, bounded
  // by their own outbound timeouts. Their results must survive the run.
  const deadline = Date.now() + 10;
  const finished: number[] = [];

  const out = await mapWithConcurrency([1, 2, 3], 3, async (n: number) => {
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 30));
    finished.push(n);
    return n;
  });

  assert.deepEqual(out, [1, 2, 3], 'all three started before the deadline and all three returned');
  assert.equal(finished.length, 3);
});
