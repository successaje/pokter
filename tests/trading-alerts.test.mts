import assert from 'node:assert/strict';
import test from 'node:test';

import { alertableFlows } from '../src/lib/trading/alerts';

const flow = (block: number, at: string, verdict: string) => ({ block, at, verdict });
const flows = [flow(100, '2026-10-21T10:00:00Z', 'not-returned'), flow(200, '2026-10-21T12:00:00Z', 'returned'), flow(300, '2026-10-21T13:00:00Z', 'not-returned')];

test('a new subscriber is told only about what was found after subscribing', () => {
  const r = alertableFlows(flows, { alertedThrough: null, subscribedAt: '2026-10-21T11:00:00Z' });
  assert.deepEqual(r.alert.map((f) => f.block), [300]);
  assert.equal(r.nextThrough, 300);
});

test('nothing is told twice: only flows after the last block covered', () => {
  assert.deepEqual(alertableFlows(flows, { alertedThrough: 300, subscribedAt: '2026-10-21T00:00:00Z' }).alert, []);
  assert.deepEqual(alertableFlows(flows, { alertedThrough: 150, subscribedAt: '2026-10-21T00:00:00Z' }).alert.map((f) => f.block), [300]);
});

test('flows that came back move the bookmark but send nothing', () => {
  const r = alertableFlows([flow(400, '2026-10-21T14:00:00Z', 'returned')], { alertedThrough: 300, subscribedAt: '2026-10-21T00:00:00Z' });
  assert.deepEqual(r.alert, []);
  assert.equal(r.nextThrough, 400);
});

test('no new flows leave the bookmark where it was', () => {
  assert.equal(alertableFlows([], { alertedThrough: 300, subscribedAt: '2026-10-21T00:00:00Z' }).nextThrough, 300);
  assert.equal(alertableFlows([], { alertedThrough: null, subscribedAt: '2026-10-21T00:00:00Z' }).nextThrough, null);
});

test('a trading alert link lands on the trading page', async () => {
  const { emailLinkDestination } = await import('../src/lib/notifications/link-destination');
  assert.equal(emailLinkDestination({ kind: 'trading' }), '/trading');
});

/*
 * End to end through the classifier: each outflow that used to pass as
 * returned, or was never read, now reaches the alert. An alert is decided
 * on the verdict alone, so a false "returned" was a silent inbox.
 */
test('every outflow the classifier used to miss now sends an alert', async () => {
  const { classifyTx, COLLECT_TOPIC, TRANSFER_TOPIC } = await import('../src/lib/trading/flows');
  const W = '0x561b561ef37874c8e61534be9bae52eb6261ddc4';
  const PM = '0x46a15b0b27311cedf172ab29e4f4766fbe7f4364';
  const POOL = '0x36696169c63e42cd08ce11f5deebbcebae652050';
  const THIEF = '0x000000000000000000000000000000000000dead';
  const FAKE = '0x00000000000000000000000000000000000fa4e0';
  const USDT = '0x55d398326f99059ff775485246999027b3197955';
  const WBNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
  const w = (x: bigint | string) => (typeof x === 'string' ? x.slice(2).padStart(64, '0') : x.toString(16).padStart(64, '0'));
  const t = (a: string) => `0x${w(a)}`;
  const erc20 = (token: string, from: string, to: string, n: bigint) => ({ address: token, topics: [TRANSFER_TOPIC, t(from), t(to)], data: `0x${w(n)}` });
  const base = { wallet: W, positionManager: PM, ownedPositions: new Set(['7']), knownTokens: new Set([USDT, WBNB]), pools: new Map([[POOL, [WBNB, USDT] as const]]) };
  const cases = {
    fakeTokenBack: [erc20(USDT, W, POOL, 10n ** 18n), erc20(FAKE, POOL, W, 10n ** 30n)],
    zeroBack: [erc20(USDT, W, POOL, 10n ** 18n), erc20(WBNB, POOL, W, 0n)],
    drainBesideSwap: [erc20(USDT, W, POOL, 10n ** 18n), erc20(WBNB, POOL, W, 10n ** 15n), erc20(USDT, W, THIEF, 10n ** 20n)],
    positionSent: [{ address: PM, topics: [TRANSFER_TOPIC, t(W), t(THIEF), `0x${w(7n)}`], data: '0x' }],
    collectedAway: [{ address: PM, topics: [COLLECT_TOPIC, `0x${w(7n)}`], data: `0x${w(THIEF)}${w(10n ** 18n)}${w(0n)}` }],
  };
  for (const [name, logs] of Object.entries(cases)) {
    const { verdict } = classifyTx({ ...base, logs });
    const r = alertableFlows([{ block: 500, at: '2026-10-21T15:00:00Z', verdict: verdict ?? 'none' }], { alertedThrough: 400, subscribedAt: '2026-10-21T00:00:00Z' });
    assert.equal(r.alert.length, 1, `${name} should alert (verdict ${verdict})`);
  }
});
