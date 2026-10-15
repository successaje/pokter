import assert from 'node:assert/strict';
import test from 'node:test';

import { crestholdAnswer, netAprPct, ratesFromPerBlock, readCrestholdBrief, swapTooCostly, type VenueFigures } from '../src/lib/house/agents/cresthold-math';

type Answer = { recommend: boolean; venue?: string; summary?: string; decline?: string; runner_up: { venue: string } | null; venues: Array<{ venue: string; fits_supply_cap: boolean; exit_warning?: string }> };
const answer = (value: unknown) => value as Answer;

test('briefs: amount, asset, current yield, holding period and threshold', () => {
  assert.deepEqual(readCrestholdBrief('Where should 1000 USDT earn the most on BNB Chain right now?'), { amount: 1000, asset: 'USDT', currentAprPct: 0, holdingDays: 30, thresholdPp: 0.5 });
  assert.deepEqual(readCrestholdBrief('5k USDC currently earning 2.5%, holding 90 days, worth it only by at least 1 point'), { amount: 5000, asset: 'USDC', currentAprPct: 2.5, holdingDays: 90, thresholdPp: 1 });
  assert.equal(readCrestholdBrief('2 weeks with 1,250.5 FDUSD idle')?.holdingDays, 14);
  assert.equal(readCrestholdBrief('Where is the best yield?'), null);
});

test("APY compounds Venus's per-block rate daily", () => {
  // 3% APR over 70,080,000 blocks a year.
  const perBlock = BigInt(Math.round((0.03 / 70_080_000) * 1e18));
  const { aprPct, apyPct } = ratesFromPerBlock(perBlock, 70_080_000);
  assert.ok(Math.abs(aprPct - 3) < 1e-6);
  assert.ok(Math.abs(apyPct - ((1 + 0.03 / 365) ** 365 - 1) * 100) < 1e-6);
});

test('one-off costs are spread over the holding period', () => {
  // 10 USD of costs on 1,000 for 30 days is 12.17 points a year.
  assert.ok(Math.abs(netAprPct({ apyPct: 5, swapCostUsd: 9, gasUsd: 1 }, { amount: 1000, holdingDays: 30 }) - (5 - 12.1666)) < 1e-3);
  assert.equal(swapTooCostly(25, 1000), true);
  assert.equal(swapTooCostly(1, 1000), false);
});

const venue = (overrides: Partial<VenueFigures>): VenueFigures => ({ venue: 'Venus USDT', market: '0x', asset: 'USDT', apyPct: 3, rateMethod: 'model', swapCostUsd: 0, gasUsd: 0, capRoomUsd: null, withdrawableUsd: 1e9, sources: [], ...overrides });
const asOf = { block: '1', time: 't' };

test('recommends only past the threshold, and declines plainly otherwise', () => {
  const brief = { amount: 1000, asset: 'USDT' as const, currentAprPct: 0, holdingDays: 30, thresholdPp: 0.5 };
  const pick = answer(crestholdAnswer(brief, [venue({}), venue({ venue: 'Venus USDC', asset: 'USDC', apyPct: 4, swapCostUsd: 0.1 })], asOf));
  assert.equal(pick.recommend, true);
  assert.equal(pick.venue, 'Venus USDC');
  assert.equal(pick.runner_up?.venue, 'Venus USDT');
  const stay = answer(crestholdAnswer({ ...brief, currentAprPct: 5 }, [venue({})], asOf));
  assert.equal(stay.recommend, false);
  assert.match(stay.decline ?? '', /falls short of your current 5% by 2 points/);
});

test('a market over its supply cap is never the pick; thin exits are flagged', () => {
  const brief = { amount: 1000, asset: 'USDT' as const, currentAprPct: 0, holdingDays: 30, thresholdPp: 0.5 };
  const result = answer(crestholdAnswer(brief, [venue({ apyPct: 9, capRoomUsd: 10, venue: 'Venus DAI' }), venue({ withdrawableUsd: 500 })], asOf));
  assert.equal(result.venue, 'Venus USDT');
  assert.equal(result.venues.find((v) => v.venue === 'Venus DAI')?.fits_supply_cap, false);
  assert.match(result.venues.find((v) => v.venue === 'Venus USDT')?.exit_warning ?? '', /withdrawable now/);
});
