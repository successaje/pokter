import assert from 'node:assert/strict';
import test from 'node:test';

import { gridPlan, readGridBrief, realisedDailyVol } from '../src/lib/house/agents/gridloom-math';

type Plan = { range: { lower: number; upper: number; basis: string }; grid: { levels: number; step_pct: number; buy_orders: unknown[]; sell_orders: unknown[] }; economics: { net_per_round_trip_pct: number; warning?: string }; warning?: string };
const plan = (value: unknown) => value as Plan;

test('briefs: asset, budget, range, grids and horizon', () => {
  assert.deepEqual(readGridBrief('Grid plan for BNB with 1000 USDT'), { base: 'BNB', budgetUsd: 1000, range: null, grids: null, horizonDays: 7 });
  assert.deepEqual(readGridBrief('ETH grid, 500 USDT, ±8%, 12 grids'), { base: 'ETH', budgetUsd: 500, range: { pct: 8 }, grids: 12, horizonDays: 7 });
  assert.deepEqual(readGridBrief('WBNB grid 2k USDT between 600-800 for 14 days')?.range, { lower: 600, upper: 800 });
  assert.equal(readGridBrief('Grid plan for DOGE with 100 USDT'), null);
  assert.equal(readGridBrief('Grid plan for BNB'), null);
});

test('daily volatility from hourly log returns', () => {
  // Alternating ±1% every hour: σ_h ≈ 0.01, σ_d ≈ 0.01 √24.
  const samples = Array.from({ length: 49 }, (_, i) => ({ t: i * 3600, price: 100 * (i % 2 ? 1.01 : 1) }));
  const vol = realisedDailyVol(samples) as number;
  assert.ok(Math.abs(vol - Math.log(1.01) * Math.sqrt(24)) < 1e-9);
  assert.equal(realisedDailyVol(samples.slice(0, 5)), null);
});

test('the auto range is a ~90% band and every step clears two pool fees', () => {
  const brief = readGridBrief('Grid plan for BNB with 1000 USDT')!;
  const p = plan(gridPlan({ brief, price: 729.5, feeRate: 0.0001, dailyVol: 0.0194 }));
  const width = 1.65 * 0.0194 * Math.sqrt(7);
  assert.ok(Math.abs(p.range.lower - 729.5 * Math.exp(-width)) < 0.01);
  assert.ok(Math.abs(p.range.upper - 729.5 * Math.exp(width)) < 0.01);
  assert.ok(p.grid.step_pct / 100 > 2 * 0.0001);
  // A level sitting exactly at the price (a symmetric band with an even count) places no order.
  const orders = p.grid.buy_orders.length + p.grid.sell_orders.length;
  assert.ok(orders === p.grid.levels || orders === p.grid.levels - 1);
});

test('a grid too fine for its fee is called a loss, and an outside price is flagged', () => {
  const brief = { ...readGridBrief('ETH grid 500 USDT ±1% 40 grids')!, grids: 40 };
  const loss = plan(gridPlan({ brief, price: 2400, feeRate: 0.0025, dailyVol: null }));
  assert.ok(loss.economics.net_per_round_trip_pct < 0);
  assert.match(loss.economics.warning ?? '', /every round trip loses/);
  const outside = plan(gridPlan({ brief: { ...brief, range: { lower: 3000, upper: 3500 }, grids: 10 }, price: 2400, feeRate: 0.0005, dailyVol: null }));
  assert.match(outside.warning ?? '', /outside this range/);
});
