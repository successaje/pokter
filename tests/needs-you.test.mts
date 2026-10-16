import assert from 'node:assert/strict';
import test from 'node:test';

import { NEEDS_SHOWN, prioritiseNeedsYou, splitNeedsYou } from '../src/lib/jobs/needs-you';

const job = (id: string, expiredAt: string) => ({ id, expiredAt });

test('the soonest deadline comes first, because that is the only thing separating these cards', () => {
  const ordered = prioritiseNeedsYou([
    job('next-week', '2026-10-23T00:00:00Z'),
    job('today', '2026-10-16T18:00:00Z'),
    job('tomorrow', '2026-10-17T09:00:00Z'),
  ]);
  assert.deepEqual(ordered.map((j) => j.id), ['today', 'tomorrow', 'next-week']);
});

test('a missing deadline sorts last and can never jump a real one', () => {
  // Otherwise an unparseable date would take the top slot and push a window
  // closing in an hour behind it.
  const ordered = prioritiseNeedsYou([job('unknown', 'not a date'), job('soon', '2026-10-16T18:00:00Z')]);
  assert.deepEqual(ordered.map((j) => j.id), ['soon', 'unknown']);
});

test('equal deadlines keep their arrival order', () => {
  const same = '2026-10-16T18:00:00Z';
  const ordered = prioritiseNeedsYou([job('a', same), job('b', same), job('c', same)]);
  assert.deepEqual(ordered.map((j) => j.id), ['a', 'b', 'c']);
});

test('three are shown and the rest are counted, not dropped', () => {
  /*
   * Every item used to be listed, so eleven deliveries to review meant
   * eleven identical cards in arrival order.
   */
  const many = Array.from({ length: 11 }, (_, i) => job(`j${i}`, `2026-10-${String(16 + i).padStart(2, '0')}T00:00:00Z`));
  const { shown, remaining } = splitNeedsYou(many);
  assert.equal(shown.length, NEEDS_SHOWN);
  assert.equal(remaining, 8);
  assert.equal(shown.length + remaining, many.length, 'the count a reader sees must add up');
  assert.deepEqual(shown.map((j) => j.id), ['j0', 'j1', 'j2']);
});

test('fewer than three leaves nothing behind', () => {
  const { shown, remaining } = splitNeedsYou([job('only', '2026-10-16T18:00:00Z')]);
  assert.equal(shown.length, 1);
  assert.equal(remaining, 0);
  assert.deepEqual(splitNeedsYou([]), { shown: [], remaining: 0 });
});
