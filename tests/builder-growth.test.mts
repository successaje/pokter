import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGrowthSnapshot, evidenceShareText } from '../src/lib/builders/growth';

const outcomes = { jobs: 3, completed: 2, terminal: 3, uniqueBuyers: 2, completionRate: 2 / 3 };
const definition = {
  id: 'yield-v1',
  label: 'Yield check',
  provenance: 'Fixture',
  limitation: 'Checks arithmetic, not execution.',
  live: false,
};

test('builder growth uses the same outcome thresholds as public rankings', () => {
  const growth = buildGrowthSnapshot({ category: 'yield', categoryLabel: 'Yield Optimisation', definition, run: null, outcomes });
  assert.equal(growth.rankingEligible, true);
  assert.deepEqual(growth.rankingGaps, []);
  assert.equal(growth.check?.status, 'not-run');
});

test('builder growth reports every missing outside-team threshold', () => {
  const growth = buildGrowthSnapshot({
    category: 'yield',
    categoryLabel: 'Yield Optimisation',
    definition,
    run: null,
    outcomes: { jobs: 1, completed: 0, terminal: 1, uniqueBuyers: 1, completionRate: 0 },
  });
  assert.deepEqual(growth.rankingGaps, ['0/2 accepted jobs', '1/3 terminal jobs', '1/2 known buyer wallets']);
});

test('share copy states only observed evidence and a passed category check', () => {
  const growth = buildGrowthSnapshot({
    category: 'yield',
    categoryLabel: 'Yield Optimisation',
    definition,
    run: { suite: 'yield-v1', status: 'checked', detail: null, passed: 3, total: 3, ranAt: '2026-10-13T00:00:00Z', results: [] },
    outcomes,
  });
  const copy = evidenceShareText('Agent A', growth);
  assert.match(copy, /2 accepted outside-team jobs from 2 known buyer wallets/);
  assert.match(copy, /yield check passed/i);
  assert.doesNotMatch(copy, /independent/i);
});

test('share copy does not turn an empty record into a performance claim', () => {
  const growth = buildGrowthSnapshot({
    category: 'unclassified',
    categoryLabel: 'Unclassified',
    definition: null,
    run: null,
    outcomes: { jobs: 0, completed: 0, terminal: 0, uniqueBuyers: 0, completionRate: null },
  });
  assert.equal(evidenceShareText('Agent A', growth), 'Agent A has a public evidence record with no accepted outside-team jobs yet on Pokter.');
});
