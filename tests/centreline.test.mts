import assert from 'node:assert/strict';
import test from 'node:test';

import { amountsAt, positionReport, priceAtTick, readCentrelineBrief, recentredRange, type PositionInput } from '../src/lib/house/agents/centreline-math';

type Report = { status: string; note: string; holds: Record<string, number>; range: { lower: number; upper: number }; price_now: number; move_to_reenter_pct?: number; placement_pct?: number; recentre: { ticks: { tickLower: number; tickUpper: number }; swap: string } };
const report = (p: PositionInput) => positionReport(p) as unknown as Report;

// USDT (token0) / WBNB (token1), 18 decimals each, as on BNB Chain.
const base: PositionInput = { id: '1', staked: false, symbol0: 'USDT', symbol1: 'WBNB', decimals0: 18, decimals1: 18, fee: 500, tickLower: -64180, tickUpper: -63980, liquidity: 4e17, tick: -65926, sqrtPrice: Math.sqrt(1.0001 ** -65926), feesRaw0: 0, feesRaw1: 0 };

test('amounts follow the v3 formulas on each side of the range', () => {
  const below = amountsAt(1e18, Math.sqrt(1.0001 ** -70000), -66000, -65000);
  assert.equal(below.raw1, 0);
  assert.ok(below.raw0 > 0);
  const above = amountsAt(1e18, Math.sqrt(1.0001 ** -60000), -66000, -65000);
  assert.equal(above.raw0, 0);
  assert.ok(above.raw1 > 0);
});

test('prices read the volatile token in the stablecoin, and out of range says which way and how far', () => {
  const r = report(base);
  assert.equal(r.status, 'out-of-range');
  // 1 / 1.0001^-65926 ≈ 729 USDT per WBNB.
  assert.ok(Math.abs(r.price_now - 1 / priceAtTick(-65926, 18, 18)) < 1e-3);
  assert.ok(r.range.lower < r.range.upper);
  assert.ok(Math.abs((r.move_to_reenter_pct as number) - Math.round((1 - r.range.upper / r.price_now) * 1000) / 10) < 0.11);
  assert.match(r.note, /above the range.*all USDT/);
  assert.equal(r.holds.WBNB, 0);
});

test('in range reports where price sits; re-centring keeps the width on the pool spacing', () => {
  const inside = report({ ...base, tickLower: -66080, tickUpper: -65880 });
  assert.equal(inside.status, 'in-range');
  assert.ok((inside.placement_pct as number) > 0 && (inside.placement_pct as number) < 100);
  const next = recentredRange(-65926, -64180, -63980, 500);
  assert.equal(next.tickUpper - next.tickLower, 200);
  assert.equal(Math.abs(next.tickLower % 10), 0);
  assert.ok(next.tickLower <= -65926 && -65926 < next.tickUpper);
});

test('closed positions and briefs', () => {
  assert.equal(positionReport({ ...base, liquidity: 0 }).status, 'closed');
  assert.equal(readCentrelineBrief('Check 0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90').account, '0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90');
  assert.equal(readCentrelineBrief('Check my LP').account, null);
});
