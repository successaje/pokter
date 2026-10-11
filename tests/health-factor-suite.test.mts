import assert from 'node:assert/strict';
import test from 'node:test';

import { hfBrief, judgeHf, readHfAnswer } from '../src/lib/assay/health-factor';
import { healthFromLiquidity } from '../src/lib/assay/venus';

const E18 = 10n ** 18n;

test('the health factor follows from Venus liquidity figures', () => {
  // $1,000 debt with $300 spare capacity: weighted collateral $1,300.
  assert.equal(healthFromLiquidity(1000n * E18, 300n * E18, 0n), 1.3);
  // $1,000 debt with a $50 shortfall: weighted collateral $950, liquidatable.
  assert.equal(healthFromLiquidity(1000n * E18, 0n, 50n * E18), 0.95);
  assert.equal(healthFromLiquidity(0n, 500n * E18, 0n), null);
});

test('the brief names the account, the venue and the answer shape', () => {
  const brief = hfBrief('0x62FEDc54F855661642223085437a5B93D0b7887B');
  assert.match(brief.text, /0x62FEDc54F855661642223085437a5B93D0b7887B/);
  assert.match(brief.text, /Venus Core Pool/);
  assert.equal(brief.data.address, '0x62FEDc54F855661642223085437a5B93D0b7887B');
});

test('answers are read from data, from JSON in text, and from prose', () => {
  assert.deepEqual(readHfAnswer({ text: null, data: { health_factor: 1.6, liquidatable: false } }), { healthFactor: 1.6, unbounded: false, liquidatable: false });
  assert.deepEqual(readHfAnswer({ text: 'Result: {"healthFactor": "1.15", "isLiquidatable": "no"}', data: null }), { healthFactor: 1.15, unbounded: false, liquidatable: false });
  assert.deepEqual(readHfAnswer({ text: null, data: { result: { hf: 0.9756 } } }), { healthFactor: 0.9756, unbounded: false, liquidatable: null });
  assert.equal(readHfAnswer({ text: 'The health factor is 0.98, so the position can be liquidated.', data: null })?.liquidatable, true);
  assert.equal(readHfAnswer({ text: null, data: { health_factor: null } })?.unbounded, true);
  assert.equal(readHfAnswer({ text: 'I monitor Venus positions.', data: null }), null);
});

const at = (healthFactor: number | null) => ({ healthFactor, liquidatable: healthFactor !== null && healthFactor < 1 });

test('an answer within 2% of either reading passes; outside both fails', () => {
  assert.equal(judgeHf([at(1.5), at(1.52)], { healthFactor: 1.53, unbounded: false, liquidatable: false }).pass, true);
  assert.equal(judgeHf([at(1.5), at(1.5)], { healthFactor: 1.6, unbounded: false, liquidatable: false }).pass, false);
  assert.equal(judgeHf([at(1.5)], null).pass, false);
});

test('a wrong liquidation call fails, unless the position crossed 1 between readings', () => {
  assert.equal(judgeHf([at(0.97), at(0.97)], { healthFactor: 0.97, unbounded: false, liquidatable: false }).pass, false);
  assert.equal(judgeHf([at(0.995), at(1.005)], { healthFactor: 1.0, unbounded: false, liquidatable: false }).pass, true);
});

test('no debt must be answered as no health factor', () => {
  assert.equal(judgeHf([at(null)], { healthFactor: null, unbounded: true, liquidatable: false }).pass, true);
  assert.equal(judgeHf([at(null)], { healthFactor: 0, unbounded: false, liquidatable: false }).pass, false);
});

test('an answer on collateral factors is told apart from a wrong one', () => {
  const reading = { healthFactor: 1.5077, borrowLimitRatio: 1.3067, liquidatable: false };
  const verdict = judgeHf([reading, reading], { healthFactor: 1.307, unbounded: false, liquidatable: false });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.outcome, 'borrow-limit');
  assert.equal(judgeHf([reading], { healthFactor: 1.1, unbounded: false, liquidatable: false }).outcome, 'wrong');
  assert.equal(judgeHf([reading], { healthFactor: 1.51, unbounded: false, liquidatable: false }).outcome, 'correct');
});
