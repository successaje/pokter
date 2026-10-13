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

test('static suites use three deterministic scenarios and stable ids', () => {
  assert.equal(STATIC_SUITES.rebalancing.id, CATEGORY_SUITE_IDS.rebalancing);
  for (const suite of Object.values(STATIC_SUITES)) {
    assert.equal(suite.scenarios.length, 3, suite.category);
    assert.equal(new Set(suite.scenarios.map((scenario) => scenario.id)).size, 3);
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

test('rebalancing expected values include threshold boundary', () => {
  assert.deepEqual(STATIC_SUITES.rebalancing.scenarios[1].expected, { max_drift_pct: 5, rebalance_needed: true });
});

test('yield suite deducts gas and impermanent loss rather than ranking headline APY', () => {
  assert.deepEqual(STATIC_SUITES.yield.scenarios[0].expected, { best_route: 'efficient', net_annual_usd: 85 });
});

test('token safety rule distinguishes blocked sales, controls and clean supplied facts', () => {
  assert.deepEqual(STATIC_SUITES['token-safety'].scenarios.map((scenario) => scenario.expected), [
    { verdict: 'FAIL' }, { verdict: 'CAUTION' }, { verdict: 'PASS' },
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
