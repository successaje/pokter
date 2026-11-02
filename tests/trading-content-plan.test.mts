import assert from 'node:assert/strict';
import test from 'node:test';

import { checkDeliveredPlan } from '../src/lib/delivery/plan-checks';
import { planProofCoverage, planProofSpec } from '../src/lib/delivery/plan-proof';
import { hireCriteria, hirePlanProofSpec } from '../src/lib/proofrun/hire-criteria';

const trading = {
  direction: 'long', entry_price: 100, stop_price: 90, take_profit_price: 120,
  size_units: 2, risk_usd: 20, reward_usd: 40, risk_reward_ratio: 2,
  fee_usd: 1, slippage_pct: 0.5, as_of: { time: '2026-11-02T10:00:00Z' }, sources: ['Quote at the stated time'],
};
const content = {
  draft: 'Explore BNB Chain with a clear plan today.', word_count: 8, format: 'post',
  claims: [{ text: 'BNB Chain supports agents.', source: 'BNB Chain documentation' }],
  as_of: { time: '2026-11-02T10:00:00Z' }, sources: ['BNB Chain documentation'],
};
const outcomes = (answer: object, brief: string | null = null) => Object.fromEntries(checkDeliveredPlan(JSON.stringify(answer), brief)!.checks.map((item) => [item.id, item.outcome]));

test('Trading checks price direction and risk arithmetic without claiming market truth', () => {
  const report = checkDeliveredPlan(JSON.stringify(trading))!;
  assert.equal(report.kind, 'trading');
  assert.equal(report.method, 'trading-plan@1');
  assert.deepEqual(planProofCoverage(planProofSpec('trading'), report), { matched: true, missing: [] });
  assert.equal(outcomes(trading)['trading.exposure'], 'passed');
  assert.equal(outcomes({ ...trading, risk_usd: 10 })['trading.exposure'], 'failed');
  assert.equal(outcomes({ ...trading, stop_price: 110 })['trading.direction'], 'failed');
  assert.equal(outcomes({ ...trading, risk_reward_ratio: 3 })['trading.ratio'], 'failed');
  assert.equal(outcomes({ ...trading, slippage_pct: -1 })['trading.costs'], 'failed');
  assert.equal(outcomes({ ...trading, size_units: undefined })['trading.exposure'], 'not-verified');
  assert.match(report.notCovered[0], /market/);
});

test('Content checks literal brief terms and citations without claiming editorial quality', () => {
  const brief = JSON.stringify({ data: { min_words: 7, max_words: 9, format: 'post', required_phrases: ['BNB Chain'] } });
  const report = checkDeliveredPlan(JSON.stringify(content), brief)!;
  assert.equal(report.kind, 'content');
  assert.equal(report.method, 'content-plan@1');
  assert.deepEqual(planProofCoverage(planProofSpec('content'), report), { matched: true, missing: [] });
  for (const id of ['content.count', 'content.length', 'content.format', 'content.phrases', 'content.claims']) assert.equal(outcomes(content, brief)[id], 'passed', id);
  assert.equal(outcomes({ ...content, word_count: 7 }, brief)['content.count'], 'failed');
  assert.equal(outcomes({ ...content, draft: 'BNB Chain now.' }, brief)['content.length'], 'failed');
  assert.equal(outcomes({ ...content, format: 'article' }, brief)['content.format'], 'failed');
  assert.equal(outcomes({ ...content, draft: 'Explore crypto with a clear plan today.' }, brief)['content.phrases'], 'failed');
  assert.equal(outcomes({ ...content, claims: [{ text: 'A fact' }] }, brief)['content.claims'], 'failed');
  assert.equal(outcomes(content)['content.length'], 'not-verified');
  assert.match(report.notCovered[1], /originality/);
});

test('Trading and Content hires carry the matching versioned check plan', () => {
  for (const [category, kind] of [['Trading', 'trading'], ['Content', 'content']] as const) {
    assert.equal(hirePlanProofSpec({ category })?.kind, kind);
    assert.match(hireCriteria({ category, brief: 'Make a plan' })?.[0] ?? '', /^pokter-plan-check\/1 spec=0x/);
  }
});
