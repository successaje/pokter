import assert from 'node:assert/strict';
import test from 'node:test';

import { brinkwatchReport, readBrief, statusFor } from '../src/lib/house/agents/brinkwatch-report';

/* The report is a union (no debt, or a full reading); tests read the full one. */
type Full = {
  status: string;
  summary: string;
  restore: { repay_usd: number; or_add_weighted_collateral_usd: number };
  liquidation: { all_collateral_drop_pct: number; assumption: string; per_asset: Record<string, { liquidates_alone: boolean; price_drop_pct?: number }> };
};
const full = (value: unknown) => value as Full;

const base = { account: '0x1', block: '1', blockTime: '2026-10-15T00:00:00.000Z', borrowLimitRatio: 1.2, liquidatable: false, target: 1.5 };

test('repay, added collateral and liquidation drops follow from HF = W / D', () => {
  // W = 10,000 × 0.8 + 5,000 × 0.8 = 12,000; D = 10,000; HF = 1.2.
  const report = full(brinkwatchReport({ ...base, healthFactor: 1.2, collateral: { BNB: { amount: 10_000, liqThreshold: 0.8 }, BTC: { amount: 5_000, liqThreshold: 0.8 } }, debt: { USDT: 10_000 } }));
  assert.equal(report.status, 'watch');
  assert.equal(report.restore.repay_usd, 2_000); // 10,000 − 12,000 / 1.5
  assert.equal(report.restore.or_add_weighted_collateral_usd, 3_000); // 1.5 × 10,000 − 12,000
  assert.equal(report.liquidation.all_collateral_drop_pct, 16.7); // 1 − 1 / 1.2
  assert.equal(report.liquidation.per_asset.BNB.price_drop_pct, 25); // (12,000 − 10,000) / 8,000
  assert.equal(report.liquidation.per_asset.BTC.price_drop_pct, 50); // (12,000 − 10,000) / 4,000
  assert.match(report.liquidation.assumption, /stablecoins/);
});

test('an asset whose loss alone cannot liquidate says so', () => {
  const report = full(brinkwatchReport({ ...base, healthFactor: 3, collateral: { BNB: { amount: 30_000, liqThreshold: 0.5 }, ETH: { amount: 3_000, liqThreshold: 0.5 } }, debt: { USDT: 5_500 } }));
  assert.equal(report.liquidation.per_asset.ETH.liquidates_alone, false);
  assert.equal(report.restore.repay_usd, 0);
});

test('volatile debt is flagged as approximate; no debt is a plain answer', () => {
  const volatile = full(brinkwatchReport({ ...base, healthFactor: 1.3, collateral: { BTC: { amount: 13_000, liqThreshold: 1 } }, debt: { ETH: 10_000 } }));
  assert.match(volatile.liquidation.assumption, /ETH, which moves too/);
  const none = full(brinkwatchReport({ ...base, healthFactor: null, collateral: {}, debt: {} }));
  assert.equal(none.status, 'no-debt');
  assert.match(none.summary, /No Venus Core Pool position/);
});

test('statuses and brief reading', () => {
  assert.deepEqual([0.99, 1.05, 1.3, 2].map(statusFor), ['liquidatable', 'at-risk', 'watch', 'comfortable']);
  const wallet = '0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90';
  assert.deepEqual(readBrief(`Venus health factor for ${wallet} and the repay that restores 1.3`), { account: wallet, target: 1.3 });
  assert.deepEqual(readBrief(`Check ${wallet}`), { account: wallet, target: 1.5 });
  assert.equal(readBrief('Check my position target 9').target, 1.5); // out of range falls back
  assert.equal(readBrief('no address here').account, null);
});

test('dust in a volatile asset does not make the reading approximate', () => {
  const report = full(brinkwatchReport({ ...base, healthFactor: 1.99, collateral: { XRP: { amount: 274_588, liqThreshold: 0.65 } }, debt: { USDT: 88_690, USDC: 35_312, BTC: 6.93 } }));
  assert.match(report.liquidation.assumption, /stablecoins/);
});

test('the report answers the exact shape its brief asks for', () => {
  /*
   * The brief says: Reply with JSON only: {"health_factor": number or null
   * when there is no debt, "liquidatable": boolean}. The report returned
   * `status` and no `liquidatable`, so a caller reading the promised shape
   * found the field missing — and the first paid correctness check passed
   * only because the judge treats an unstated liquidation as not
   * contradicting Venus.
   */
  const safe = brinkwatchReport({ ...base, healthFactor: 2.0686, collateral: { BNB: { amount: 10_000, liqThreshold: 0.8 } }, debt: { USDT: 3_867 } });
  assert.equal(safe.liquidatable, false);
  assert.equal(typeof safe.health_factor, 'number');

  // Venus's own shortfall, not a re-derivation from the health factor here.
  const under = brinkwatchReport({ ...base, liquidatable: true, healthFactor: 0.94, collateral: { BNB: { amount: 10_000, liqThreshold: 0.8 } }, debt: { USDT: 8_500 } });
  assert.equal(under.liquidatable, true);
  assert.equal(under.status, 'liquidatable');

  // A position with no debt cannot be liquidated, and still says so.
  const none = brinkwatchReport({ ...base, healthFactor: null, collateral: {}, debt: {} });
  assert.equal(none.liquidatable, false);
  assert.equal(none.health_factor, null);
});
