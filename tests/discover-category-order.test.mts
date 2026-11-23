import assert from 'node:assert/strict';
import test from 'node:test';

import { CATEGORIES } from '../src/lib/agents/categories';
import { FLAGSHIP_CATEGORY_ORDER } from '../src/lib/agents/flagship-playbooks';
import { CATEGORY_ORDER, categoryRank } from '../src/features/discover/category-order';

/*
 * The order the task filters read in.
 *
 * Discover shows two lists of categories within a few pixels of each
 * other: a "Plan a better hire" nav of the four kinds of work Pokter
 * publishes a guide for, and the filter row under it. They were written
 * out separately and disagreed — the nav recommended four, the row put
 * those same four fifth through eighth and wrapped the largest onto a
 * second line. The row derives from the nav's list now, and these hold
 * that: the agreement, and the properties a sort order has to have before
 * a category can quietly fall out of a row.
 */

test('the four kinds of work with a buying guide come first, in the guides own order', () => {
  assert.deepEqual(CATEGORY_ORDER.slice(0, FLAGSHIP_CATEGORY_ORDER.length), [...FLAGSHIP_CATEGORY_ORDER]);
  /* And they are the first four by rank, not merely present early in the array. */
  for (const [i, id] of FLAGSHIP_CATEGORY_ORDER.entries()) {
    assert.equal(categoryRank(id), i, `${id} should rank ${i}`);
  }
});

test('every category the catalogue defines has a place, and no two share one', () => {
  /*
   * A category missing from the order would sort last as a group with
   * every other unranked one, in whatever order the counts arrived in —
   * stable enough to look deliberate and not be.
   */
  for (const { id } of CATEGORIES) {
    assert.ok(CATEGORY_ORDER.includes(id), `${id} is defined in the catalogue but has no place in the row`);
    assert.ok(categoryRank(id) < CATEGORY_ORDER.length, `${id} is ranked as unknown`);
  }
  assert.equal(new Set(CATEGORY_ORDER).size, CATEGORY_ORDER.length, 'a category appears twice');
});

test('the catch-all sorts last, and so does anything unrecognised', () => {
  assert.equal(categoryRank('unclassified'), CATEGORY_ORDER.length - 1);
  /*
   * An id the list has never heard of must sort last rather than first,
   * which is what a missing entry does under a plain numeric sort when
   * the lookup yields undefined.
   */
  assert.equal(categoryRank('not-a-category' as never), CATEGORY_ORDER.length);
  assert.ok(categoryRank('not-a-category' as never) > categoryRank('unclassified'));
});

test('sorting by rank puts the row in the intended order', () => {
  /* Shuffled on purpose: the sort is the thing under test, not the input. */
  const shuffled = [...CATEGORIES.map((c) => c.id)].reverse();
  const sorted = shuffled.sort((a, b) => categoryRank(a) - categoryRank(b));
  assert.deepEqual(sorted.slice(0, 4), [...FLAGSHIP_CATEGORY_ORDER]);
  assert.equal(sorted.length, CATEGORIES.length, 'the sort dropped a category');
});
