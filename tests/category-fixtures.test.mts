import assert from 'node:assert/strict';
import test from 'node:test';

import { STATIC_SUITES, judgeStaticAnswer } from '../src/lib/assay/category-suites';
import { gridPlan, readGridBrief } from '../src/lib/house/agents/gridloom-math';
import { readCrestholdBrief } from '../src/lib/house/agents/cresthold-math';

/*
 * The check version 1 of these fixtures needed and did not have.
 *
 * Version 1 asked for arithmetic over values supplied as JSON, with an
 * `answer_shape` telling the agent what to return. Every agent in these
 * categories reads its inputs from a brief written the way a buyer writes
 * one, so all three of Pokter's own refused their own category's fixture
 * on every scenario — and nobody noticed, because no test asked whether
 * the fixture was one the service could read.
 */

test('a grid agent can read every grid fixture, and its own plan satisfies it', () => {
  const suite = STATIC_SUITES['grid-trading'];
  assert.ok(suite.scenarios.length >= 3);

  for (const scenario of suite.scenarios) {
    const brief = readGridBrief(scenario.brief.text);
    assert.ok(brief, `${scenario.id}: the fixture must be a brief the service can read`);
    assert.ok(brief.range && 'lower' in brief.range, `${scenario.id}: the range must survive parsing`);

    /*
     * Planned at an arbitrary live price: the expectations are the ones the
     * brief fixes, so they must hold whatever the market is doing. A fixture
     * that only passes at one price is testing the clock.
     */
    for (const price of [brief.range.lower * 1.03, brief.range.upper * 0.98, brief.range.lower * 0.5]) {
      const answer = gridPlan({ brief, price, feeRate: 0.0025, dailyVol: 0.03 });
      const verdict = judgeStaticAnswer(scenario.expected as Record<string, unknown>, { text: null, data: answer as unknown as Record<string, unknown> });
      assert.equal(verdict.pass, true, `${scenario.id} at ${price}: ${verdict.reason}`);
    }
  }
});

test('a grid plan that loses the budget or the bounds fails the fixture', () => {
  // The failure these fixtures exist for: a competitor's grid agent read a
  // 1,000 USDT budget as 814 — the upper price bound — and allocated that.
  const scenario = STATIC_SUITES['grid-trading'].scenarios[0];
  const brief = readGridBrief(scenario.brief.text)!;
  const expected = scenario.expected as Record<string, unknown>;

  const wrongBudget = gridPlan({ brief: { ...brief, budgetUsd: 814 }, price: 1_000, feeRate: 0.0025, dailyVol: 0.03 });
  assert.equal(judgeStaticAnswer(expected, { text: null, data: wrongBudget as unknown as Record<string, unknown> }).pass, false);

  const wrongGrids = gridPlan({ brief: { ...brief, grids: 12 }, price: 1_000, feeRate: 0.0025, dailyVol: 0.03 });
  assert.equal(judgeStaticAnswer(expected, { text: null, data: wrongGrids as unknown as Record<string, unknown> }).pass, false);
});

test('a yield agent can read every yield fixture with its terms intact', () => {
  const suite = STATIC_SUITES.yield;
  assert.ok(suite.scenarios.length >= 3);

  for (const scenario of suite.scenarios) {
    const brief = readCrestholdBrief(scenario.brief.text);
    assert.ok(brief, `${scenario.id}: the fixture must be a brief the service can read`);
    const expected = scenario.expected as Record<string, number | string>;
    // The buyer's own terms. An answer that changes them answered something else.
    assert.equal(brief.amount, expected.amount, `${scenario.id}: amount`);
    assert.equal(brief.asset, expected.asset, `${scenario.id}: asset`);
    assert.equal(brief.holdingDays, expected.holding_days, `${scenario.id}: horizon`);
    assert.equal(brief.currentAprPct, expected.current_apr_pct, `${scenario.id}: current rate`);
    assert.equal(brief.thresholdPp, expected.threshold_pp, `${scenario.id}: threshold`);
  }
});

test('the suite ids change when the fixture changes', () => {
  // A run is stored against a suite id. Rewriting a fixture under the old id
  // would make old results read as results for the new question.
  assert.equal(STATIC_SUITES['grid-trading'].id, 'grid-plan-2');
  assert.equal(STATIC_SUITES.yield.id, 'yield-net-return-2');
  // Rebalancing has no free fixture at all now: see category-assays.
  assert.equal((STATIC_SUITES as Record<string, unknown>).rebalancing, undefined);
});
