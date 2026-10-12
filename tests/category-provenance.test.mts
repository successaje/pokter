import assert from 'node:assert/strict';
import test from 'node:test';

import { CATEGORIES, NO_CATEGORY, categorySignalSource, classify } from '../src/lib/agents/categories';

/* The live record of Pokter's own evidence agent, 97/2599. */
const EVIDENCE = {
  name: 'Pokter Evidence',
  description:
    'Reports what Pokter measured about any ERC-8004 agent on BNB Chain: how many times it was called, how many times it answered, whether its signed price can be settled by the escrow, and where each number came from. Give it an agent like 56/303779. It reports; it does not rank.',
  tags: ['token-safety'],
  categories: ['token-safety'],
  supported_protocols: ['A2A'],
} as never;

test('a declared tag is what put this agent in its category', () => {
  /*
   * The point of the test: the category is the publisher's own word, not
   * Pokter's reading of the prose. Reporting it as a Pokter calculation
   * was a false provenance claim, and this agent carried it about itself.
   */
  assert.equal(classify(EVIDENCE), 'token-safety');
  assert.equal(categorySignalSource(EVIDENCE, 'token-safety'), 'declared');
});

test('without the tag, this description names no category at all', () => {
  const untagged = { ...(EVIDENCE as object), tags: [], categories: [] } as never;
  assert.equal(classify(untagged), 'unclassified');
  assert.equal(categorySignalSource(untagged, 'token-safety'), null);
});

test('a name that names its category is reported as the name, not a declaration', () => {
  const named = { name: 'BSC Grid Planner', description: 'Plans ladders.', tags: [] } as never;
  assert.equal(classify(named), 'grid-trading');
  assert.equal(categorySignalSource(named, 'grid-trading'), 'name');
});

test('prose alone is reported as the description', () => {
  const prose = {
    name: 'Agent 7',
    description: 'Keeps a portfolio allocation on target by rebalancing drifted weights.',
    tags: [],
  } as never;
  assert.equal(categorySignalSource(prose, 'rebalancing'), 'description');
});

/*
 * Registering without claiming a category it does not fit.
 *
 * The create flow required one of the five, so an agent matching none
 * had to claim one — and a declared tag is close to decisive, so the
 * claim became the description buyers read. This pins the two rules the
 * fix depends on.
 */
test('the no-category sentinel is not one of the real categories', () => {
  assert.equal(CATEGORIES.some((c) => (c.id as string) === NO_CATEGORY), false);
});

test('choosing it writes no tag into the registry', () => {
  /* The exact expression the draft uses to build the registration file.
     Writing "none" would put the word in front of every reader and
     every other marketplace's classifier. */
  const tagsFor = (category: string) =>
    CATEGORIES.some((c) => (c.id as string) === category) ? [category] : [];
  assert.deepEqual(tagsFor(NO_CATEGORY), []);
  assert.deepEqual(tagsFor(''), []);
  assert.deepEqual(tagsFor('token-safety'), ['token-safety']);
});

test('an agent with no tag classifies as unclassified, not as something', () => {
  assert.equal(
    classify({ name: 'Pokter Evidence', description: 'Reports what Pokter measured.', tags: [], categories: [] } as never),
    'unclassified',
  );
});
