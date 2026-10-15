import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_PENDING, nextPending, parsePending } from '../src/lib/erc8183/reconcile-pending';

test('an unreadable or unfunded job stays on the list until it resolves', () => {
  // Run 1: job 12 could not be read, job 15 is Pokter's and still OPEN.
  const afterFirst = nextPending([], [12, 15], [], 1);
  assert.deepEqual(afterFirst, [12, 15]);
  // Run 2: 12 is read and recovered, 15 is still OPEN.
  assert.deepEqual(nextPending(afterFirst, [15], [12], 1), [15]);
});

test('ids too old to matter age out, and the list stays bounded', () => {
  assert.deepEqual(nextPending([3, 50, 70], [], [], 40), [50, 70]);
  const many = Array.from({ length: MAX_PENDING + 20 }, (_, i) => i + 1);
  const kept = nextPending(many, [], [], 1);
  assert.equal(kept.length, MAX_PENDING);
  assert.equal(kept[0], 21); // the newest are kept
});

test('a damaged stored list reads as empty, not as a crash', () => {
  assert.deepEqual(parsePending(null), []);
  assert.deepEqual(parsePending('not json'), []);
  assert.deepEqual(parsePending('[1, -2, "3", 4.5, 7]'), [1, 7]);
});
