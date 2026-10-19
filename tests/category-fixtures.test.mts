import assert from 'node:assert/strict';
import test from 'node:test';

import { STATIC_SUITES, judgeStaticAnswer, verdictClass } from '../src/lib/assay/category-suites';
import { gridPlan, readGridBrief } from '../src/lib/house/agents/gridloom-math';
import { crestholdAnswer, readCrestholdBrief } from '../src/lib/house/agents/cresthold-math';
import { readTouchstoneBrief, touchstoneVerdict, type TokenFacts } from '../src/lib/house/agents/touchstone-math';

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

test("a yield agent's own answer satisfies every yield fixture, and a changed asset fails it", () => {
  /*
   * Parsing the brief is not enough: the grader reads the terms back out of
   * the delivered answer, so the answer has to carry them where it looks.
   */
  for (const scenario of STATIC_SUITES.yield.scenarios) {
    const brief = readCrestholdBrief(scenario.brief.text)!;
    const venue = { venue: `Venus ${brief.asset}`, market: '0x0', asset: brief.asset, apyPct: 4, rateMethod: 'model', swapCostUsd: 0, gasUsd: 0.05, capRoomUsd: null, withdrawableUsd: 1e9, sources: [] };
    const answer = crestholdAnswer(brief, [venue], { block: '1', time: '2026-10-16T00:00:00Z' });
    const verdict = judgeStaticAnswer(scenario.expected as Record<string, unknown>, { text: null, data: answer as unknown as Record<string, unknown> });
    assert.equal(verdict.pass, true, `${scenario.id}: ${verdict.reason}`);

    const swapped = crestholdAnswer({ ...brief, asset: brief.asset === 'USDT' ? 'USDC' : 'USDT' }, [venue], { block: '1', time: '2026-10-16T00:00:00Z' });
    assert.equal(judgeStaticAnswer(scenario.expected as Record<string, unknown>, { text: null, data: swapped as unknown as Record<string, unknown> }).pass, false, `${scenario.id}: a changed asset must fail`);
  }
});

test('a token-safety agent can read every token fixture, and its rule agrees with each', () => {
  /*
   * Version 1 supplied facts as JSON with no address; Touchstone refused all
   * three. Each fixture now names an address, and the facts below are the
   * ones that address has held for years.
   */
  const facts: Record<string, TokenFacts> = {
    'not-a-contract': { isContract: false, symbol: null, probe: null, owner: { address: null, renounced: false }, powers: [], upgradable: false, liquidityUsd: null, lpBurnedShare: null, ownerShare: null, burnedShare: null },
    'owner-can-mint': { isContract: true, symbol: 'USDT', probe: { stage: 0, buyTax: 0, sellTax: 0 }, owner: { address: '0xF68a4b64162906efF0fF6aE34E2bB1Cd42FEf62d', renounced: false, isContract: false }, powers: ['mint'], upgradable: false, liquidityUsd: 50_000_000, lpBurnedShare: 0, ownerShare: 0, burnedShare: 0 },
    'wrapped-native': { isContract: true, symbol: 'WBNB', probe: null, owner: { address: null, renounced: false }, powers: [], upgradable: false, liquidityUsd: null, lpBurnedShare: null, ownerShare: null, burnedShare: 0, wrappedNative: true },
    'upgradable-with-mint': { isContract: true, symbol: 'USDC', probe: { stage: 0, buyTax: 0, sellTax: 0 }, owner: { address: '0xF68a4b64162906efF0fF6aE34E2bB1Cd42FEf62d', renounced: false, isContract: false }, powers: ['mint'], upgradable: true, liquidityUsd: 300_000, lpBurnedShare: 0, ownerShare: 0, burnedShare: 0 },
  };
  const suite = STATIC_SUITES['token-safety'];
  assert.equal(suite.scenarios.length, 4);
  for (const scenario of suite.scenarios) {
    assert.ok(readTouchstoneBrief(scenario.brief.text).token, `${scenario.id}: the fixture must name a token address`);
    const { verdict } = touchstoneVerdict(facts[scenario.id]);
    const judged = judgeStaticAnswer(scenario.expected as Record<string, unknown>, { text: null, data: { verdict } });
    assert.equal(judged.pass, true, `${scenario.id}: ${judged.reason}`);
  }
});

test('verdict words are read into a class, and a token with an active minter is not safe', () => {
  assert.equal(verdictClass('Safe'), 'PASS');
  assert.equal(verdictClass('high_risk'), 'FAIL');
  assert.equal(verdictClass('Medium'), 'CAUTION');
  // An unrecognised word is not guessed into a class.
  assert.equal(verdictClass('probably fine'), 'PROBABLY FINE');
  const mint = STATIC_SUITES['token-safety'].scenarios.find((s) => s.id === 'owner-can-mint')!;
  assert.equal(judgeStaticAnswer(mint.expected as Record<string, unknown>, { text: '{"verdict":"Safe"}', data: null }).pass, false);
  assert.equal(judgeStaticAnswer(mint.expected as Record<string, unknown>, { text: '{"verdict":"caution"}', data: null }).pass, true);
});

test('the suite ids change when the fixture changes', () => {
  // A run is stored against a suite id. Rewriting a fixture under the old id
  // would make old results read as results for the new question.
  assert.equal(STATIC_SUITES['grid-trading'].id, 'grid-plan-2');
  assert.equal(STATIC_SUITES.yield.id, 'yield-net-return-2');
  assert.equal(STATIC_SUITES['token-safety'].id, 'token-safety-2');
  // Rebalancing has no free fixture at all now: see category-assays.
  assert.equal((STATIC_SUITES as Record<string, unknown>).rebalancing, undefined);
});

/*
 * Nagi's answer to the BNB scenario (97:1511), as delivered: every figure
 * right, under its own names. It was graded 0 / 3 for "not stating" the pair.
 */
const NAGI_BNB = {
  base: 'BNB', quote: 'USDT', budget: 1000, range: { lower: 900, upper: 1100 }, grids: 8, spacing: 'geometric',
  ratio: 1.0254010834, step_pct: 2.540108,
  price_levels: [900, 922.860975, 946.302644, 970.339756, 994.987437, 1020.261196, 1046.176936, 1072.750963, 1100],
  per_grid_quote: 125,
};

test('a grid answer is graded on its figures, not on which names it uses for them', () => {
  const expected = STATIC_SUITES['grid-trading'].scenarios[0].expected as Record<string, unknown>;
  const verdict = judgeStaticAnswer(expected, { text: null, data: NAGI_BNB });
  assert.equal(verdict.pass, true, verdict.reason);
  assert.deepEqual(verdict.observed, { pair: 'BNB/USDT', step_pct: 2.540108, levels: 9, budget_usd: 1000 });
});

test('the same names with a wrong figure still fail, on the figure', () => {
  const expected = STATIC_SUITES['grid-trading'].scenarios[0].expected as Record<string, unknown>;
  const fewerLevels = { ...NAGI_BNB, price_levels: NAGI_BNB.price_levels.slice(0, 7) };
  assert.match(judgeStaticAnswer(expected, { text: null, data: fewerLevels }).reason, /levels should be 9; answered 7/);
  const wrongBudget = { ...NAGI_BNB, budget: 814 };
  assert.match(judgeStaticAnswer(expected, { text: null, data: wrongBudget }).reason, /budget_usd should be 1000; answered 814/);
  const wrongBase = { ...NAGI_BNB, base: 'CAKE' };
  assert.equal(judgeStaticAnswer(expected, { text: null, data: wrongBase }).pass, false);
});

test('a yield answer that only echoes the brief back states nothing', () => {
  // Venus Yield Keeper (97:2554, job 1522): the brief returned as a string, then a report on its own position.
  const expected = STATIC_SUITES.yield.scenarios[0].expected as Record<string, unknown>;
  const echoed = {
    task: JSON.stringify({ task: 'I hold 1000 USDT…', data: { amount: 1000, asset: 'USDT', holding_days: 30, current_apr_pct: 0, threshold_pp: 0.5 } }),
    answer: 'Venus vBNB supply APY 35.20%. Supplied 0.0571 BNB.',
    report: { market: 'Venus core pool vBNB', apy: '35.20%' },
  };
  assert.equal(judgeStaticAnswer(expected, { text: null, data: echoed }).pass, false);
});
