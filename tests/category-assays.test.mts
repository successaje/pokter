import assert from 'node:assert/strict';
import test from 'node:test';

import { CATEGORY_SUITE_IDS, STATIC_SUITES, judgeStaticAnswer, staticSuiteFor } from '../src/lib/assay/category-suites';
import { assayForCategory } from '../src/lib/assay/catalog';

test('every marketplace category has a disclosed correctness suite', () => {
  for (const category of ['rebalancing', 'grid-trading', 'yield', 'health-factor', 'token-safety'] as const) {
    const assay = assayForCategory(category);
    assert.ok(assay, category);
    assert.ok(assay.provenance.length > 20);
    assert.ok(assay.limitation.length > 20);
  }
  assert.equal(assayForCategory('unclassified'), null);
});

test('static suites use at least three deterministic scenarios and stable ids', () => {
  for (const [category, id] of Object.entries(CATEGORY_SUITE_IDS)) {
    assert.equal(STATIC_SUITES[category as keyof typeof CATEGORY_SUITE_IDS].id, id);
  }
  for (const suite of Object.values(STATIC_SUITES)) {
    assert.ok(suite.scenarios.length >= 3, suite.category);
    assert.equal(new Set(suite.scenarios.map((scenario) => scenario.id)).size, suite.scenarios.length);
  }
});

test('briefs disclose output types without leaking the expected answer', () => {
  for (const suite of Object.values(STATIC_SUITES)) {
    for (const scenario of suite.scenarios) {
      assert.notDeepEqual(scenario.brief.data.answer_shape, scenario.expected, `${suite.category}:${scenario.id}`);
      assert.equal(JSON.stringify(scenario.brief.data).includes(JSON.stringify(scenario.expected)), false);
    }
  }
});

test('rebalancing has no free fixture, because no listed service answers one', () => {
  /*
   * There was a portfolio-weight drift suite here. The service Pokter
   * lists under rebalancing reviews a concentrated-liquidity position
   * range for a named wallet and refuses a brief with no address, so the
   * fixture could only ever record failures it had not earned. The
   * category is measured by the paid position-range check instead.
   */
  assert.equal(assayForCategory('rebalancing')?.id, 'v3-range-1');
  assert.equal(staticSuiteFor('rebalancing'), null);
});

test('yield suite expects the buyer\'s own terms back, not a rate it cannot verify', () => {
  /*
   * This asserted { best_route: 'efficient', net_annual_usd: 85 } — the
   * answer to arithmetic over a route table supplied as JSON, which no
   * yield agent accepts as a brief. The fixture now asks in the buyer's
   * idiom and expects what the brief itself fixes; rates and the chosen
   * venue are live and rest on the agent's own cost model, so pinning
   * them here would be Pokter marking its own homework.
   */
  assert.deepEqual(STATIC_SUITES.yield.scenarios[0].expected, {
    amount: 1_000, asset: 'USDT', holding_days: 30, current_apr_pct: 0, threshold_pp: 0.5,
  });
});

test('token safety fixtures separate a non-token, tokens whose owner can mint, and WBNB', () => {
  assert.deepEqual(STATIC_SUITES['token-safety'].scenarios.map((scenario) => scenario.expected), [
    { verdict: 'FAIL' }, { verdict: 'CAUTION' }, { verdict: 'CAUTION' }, { verdict: 'PASS' },
  ]);
});

test('judge reads nested structured answers and tolerates harmless numeric rounding', () => {
  const verdict = judgeStaticAnswer(
    { step_pct: 5.1271, intervals: 4, label: 'PASS' },
    { text: null, data: { result: { step_pct: '5.13', intervals: 4, label: 'pass' } } },
  );
  assert.equal(verdict.pass, true);
  assert.deepEqual(verdict.observed, { step_pct: '5.13', intervals: 4, label: 'pass' });
});

test('judge fails missing or incorrect required outputs with an explicit reason', () => {
  const missing = judgeStaticAnswer({ verdict: 'PASS' }, { text: 'No JSON here', data: null });
  assert.equal(missing.pass, false);
  assert.match(missing.reason, /No JSON/);
  const wrong = judgeStaticAnswer({ rebalance_needed: true }, { text: '{"rebalance_needed":false}', data: null });
  assert.equal(wrong.pass, false);
  assert.match(wrong.reason, /should be true/);
});

test('suite lookup does not turn unclassified agents into tested agents', () => {
  assert.equal(staticSuiteFor('unclassified'), null);
});
