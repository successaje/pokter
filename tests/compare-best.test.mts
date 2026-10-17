import assert from 'node:assert/strict';
import test from 'node:test';

import { leaders } from '../src/lib/compare/best';

test('the best value on a row is marked, in the right direction', () => {
  assert.deepEqual([...leaders([0.9, 0.5, 0.7], 'higher')], [0]);
  assert.deepEqual([...leaders([1200, 300, 800], 'lower')], [1]);
});

test('ties share the mark, but a row where all agree has none', () => {
  assert.deepEqual([...leaders([3, 3, 1], 'higher')].sort(), [0, 1]);
  assert.equal(leaders([2, 2], 'higher').size, 0);
});

test('absent data never leads and is never read as zero', () => {
  assert.deepEqual([...leaders([null, 400, 900], 'lower')], [1]);
  assert.equal(leaders([null, 400], 'lower').size, 0, 'one value is nothing to compare');
  assert.equal(leaders([null, null], 'higher').size, 0);
});
