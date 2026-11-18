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

function rated(history: { delivered: number; missed: number } | undefined, buyerRating: { reviewers: number; average: number } | null) {
  return { ...(inputs(history) as object), buyerRating } as never;
}

test('a rating from fewer than three Agent ID holders does not move the score', () => {
  const plain = performance(computeScore(inputs({ delivered: 4, missed: 0 })));
  for (const reviewers of [1, 2]) {
    const scored = performance(computeScore(rated({ delivered: 4, missed: 0 }, { reviewers, average: 1 })));
    assert.equal(scored.earned, plain.earned, `${reviewers} reviewer(s)`);
    assert.doesNotMatch(scored.explanation, /Agent ID/);
  }
});

test('three or more Agent ID holders make their rating half of performance', () => {
  const weight = performance(computeScore(inputs({ delivered: 4, missed: 0 }))).weight;
  // All delivered, rated 5: full marks. Rated 1: the rating's half earns nothing.
  assert.equal(performance(computeScore(rated({ delivered: 4, missed: 0 }, { reviewers: 3, average: 5 }))).earned, weight);
  assert.equal(performance(computeScore(rated({ delivered: 4, missed: 0 }, { reviewers: 3, average: 1 }))).earned, weight / 2);
  // Half delivered, rated 3 (the midpoint): a quarter plus a quarter.
  assert.equal(performance(computeScore(rated({ delivered: 2, missed: 2 }, { reviewers: 5, average: 3 }))).earned, weight / 2);

  const said = performance(computeScore(rated({ delivered: 4, missed: 0 }, { reviewers: 3, average: 4.333 })));
  assert.match(said.explanation, /Rated 4\.3\/5 by 3 people holding an Agent ID on PokterBoard, which counts for half\./);
  assert.deepEqual(said.inputs.at(-1), { label: 'Rated by Agent ID holders', value: '4.3/5 from 3' });
});

test('a board rating alone measures performance when no paid job has resolved yet', () => {
  const weight = performance(computeScore(inputs({ delivered: 1, missed: 0 }))).weight;
  const onlyRated = performance(computeScore(rated(undefined, { reviewers: 3, average: 4 })));
  assert.equal(onlyRated.earned, weight * 0.75);
  assert.match(onlyRated.explanation, /^No paid job through Pokter escrow has reached delivery or its deadline yet\. Rated 4\.0\/5/);
  assert.equal(performance(computeScore(rated(undefined, { reviewers: 2, average: 5 }))).earned, null, 'too few to measure on their own');
});
