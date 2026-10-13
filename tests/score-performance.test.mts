import assert from 'node:assert/strict';
import test from 'node:test';

import { computeScore } from '../src/lib/score/engine';

function inputs(history?: { delivered: number; missed: number }) {
  return {
    agent: { chain_id: 56, token_id: '1' },
    category: 'rebalancing',
    proof: { verdict: 'reliable', measurers: [], disclosedDefects: [], windowDays: 30, totalCount: 1, probes: 200 },
    attestations: [],
    record: { totalProbes: 200, totalAnswered: 200, longestOutage: null, windows: [], observedDays: 30 },
    history,
  } as never;
}

const performance = (score: ReturnType<typeof computeScore>) => score.dimensions.find((d) => d.dimension === 'performance')!;

test('missing most paid jobs pulls the score down, not only the verdict', () => {
  const clean = computeScore(inputs({ delivered: 7, missed: 0 }));
  const lapsing = computeScore(inputs({ delivered: 1, missed: 6 }));
  assert.equal(performance(lapsing).earned !== null, true);
  assert.ok(lapsing.overall! < clean.overall! - 15, `${lapsing.overall} should be well below ${clean.overall}`);
});

test('with no resolved paid job, performance stays unmeasured rather than zero', () => {
  assert.equal(performance(computeScore(inputs())).earned, null);
  assert.equal(performance(computeScore(inputs({ delivered: 0, missed: 0 }))).earned, null);
});
