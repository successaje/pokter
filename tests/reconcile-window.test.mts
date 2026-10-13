import assert from 'node:assert/strict';
import test from 'node:test';

import { FIRST_RUN_WINDOW, MAX_PER_RUN, scanRange } from '../src/lib/erc8183/reconcile-window';

/*
 * How far a reconciliation pass reaches.
 *
 * The escrow's mainnet counter is past 56,000. Walking all of it on every
 * sweep would be a denial-of-service against a public node for no gain,
 * so each chain keeps a cursor and each pass is bounded. These pin the
 * arithmetic that decides what a run covers, which is the part that
 * silently stops working if someone changes a constant.
 */

/* The function the reconciler itself calls, not a copy of it. */
const range = scanRange;

test('a first run looks back a bounded window, not to the beginning', () => {
  const r = range(56_980, null);
  assert.equal(r.from, 56_980 - FIRST_RUN_WINDOW + 1);
  assert.ok(r.covered <= MAX_PER_RUN, 'never more than one pass allows');
  assert.ok(r.from > 1, 'a chain with 56,980 jobs is not scanned from job 1');
});

test('a young chain starts at the first job, not a negative one', () => {
  const r = range(12, null);
  assert.equal(r.from, 1);
  assert.equal(r.to, 12);
});

test('later runs resume after the cursor and never re-read', () => {
  const first = range(56_980, null);
  const second = range(56_980, String(first.to));
  assert.equal(second.from, first.to + 1);
  assert.ok(second.from > first.to, 'no job is read twice');
});

test('a pass is capped, so a long backlog drains over several sweeps', () => {
  const r = range(60_000, '1000');
  assert.equal(r.from, 1001);
  assert.equal(r.covered, MAX_PER_RUN);
});

test('a caught-up chain does no work', () => {
  const r = range(500, '500');
  assert.equal(r.from, 501);
  assert.equal(r.covered, 0);
});

test('the window is large enough to have caught the job that prompted this', () => {
  /* 56980 was missed and sat unindexed for hours. A first run on that
     chain must reach back past it from the counter at the time. */
  assert.ok(FIRST_RUN_WINDOW >= 100, 'a window of a handful would miss a quiet afternoon');
});
