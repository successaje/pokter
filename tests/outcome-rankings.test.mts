import assert from 'node:assert/strict';
import test from 'node:test';

import { MIN_CATEGORY_CONTENDERS, rankCategoryOutcomes, type OutcomeCandidate, type OutcomeFacts } from '../src/lib/rankings/outcomes';

const facts = (completed: number, terminal: number, buyers: number): OutcomeFacts => ({
  jobs: terminal,
  completed,
  terminal,
  uniqueBuyers: buyers,
  completionRate: terminal > 0 ? completed / terminal : null,
});

function candidate(name: string, outsideTeam: OutcomeFacts, overrides: Partial<OutcomeCandidate> = {}): OutcomeCandidate {
  return {
    key: `56:${name}`,
    chainId: 56,
    tokenId: name,
    name,
    imageUrl: null,
    owner: `owner-${name}`,
    category: 'yield',
    tested: false,
    delivered: outsideTeam.completed,
    probeRate: 1,
    all: outsideTeam,
    outsideTeam,
    ...overrides,
  };
}

test('a category does not publish a number-one position from a thin field', () => {
  const result = rankCategoryOutcomes('yield', [candidate('only', facts(3, 3, 3))], 'outside-team');
  assert.equal(result.eligibleAgents, 1);
  assert.equal(result.publishRanks, false);
  assert.equal(MIN_CATEGORY_CONTENDERS, 3);
});

test('each contender must clear completions, terminal outcomes and buyer diversity', () => {
  const result = rankCategoryOutcomes('yield', [
    candidate('few-completions', facts(1, 3, 3)),
    candidate('few-outcomes', facts(2, 2, 2)),
    candidate('one-buyer', facts(3, 3, 1)),
  ], 'outside-team');
  assert.equal(result.eligibleAgents, 0);
  assert.deepEqual(result.entries.map((entry) => entry.gaps.length), [1, 1, 1]);
});

test('accepted outcomes lead, then buyer diversity and completion rate', () => {
  const result = rankCategoryOutcomes('yield', [
    candidate('lower-rate', facts(3, 4, 3)),
    candidate('more-buyers', facts(3, 3, 4)),
    candidate('more-completions', facts(4, 5, 2)),
  ], 'outside-team');
  assert.equal(result.publishRanks, true);
  assert.deepEqual(result.entries.map((entry) => entry.name), ['more-completions', 'more-buyers', 'lower-rate']);
});

test('team activity can appear only when the all-activity scope is selected', () => {
  const teamHeavy = candidate('team-heavy', facts(0, 0, 0), { all: facts(5, 5, 4) });
  assert.equal(rankCategoryOutcomes('yield', [teamHeavy], 'outside-team').entries[0].eligible, false);
  assert.equal(rankCategoryOutcomes('yield', [teamHeavy], 'all').entries[0].eligible, true);
});

test('one operator cannot occupy several places in one category', () => {
  const result = rankCategoryOutcomes('yield', [
    candidate('a', facts(4, 4, 3), { owner: 'same' }),
    candidate('b', facts(3, 3, 3), { owner: 'SAME' }),
    candidate('c', facts(2, 3, 2)),
  ], 'outside-team');
  assert.deepEqual(result.entries.map((entry) => entry.name), ['a', 'c']);
});

test('operator grouping can join separately owned wallets with a common funding signal', () => {
  const result = rankCategoryOutcomes('yield', [
    candidate('a', facts(4, 4, 3), { owner: 'wallet-a' }),
    candidate('b', facts(3, 3, 3), { owner: 'wallet-b' }),
  ], 'outside-team', () => 'shared-operator');
  assert.deepEqual(result.entries.map((entry) => entry.name), ['a']);
});
