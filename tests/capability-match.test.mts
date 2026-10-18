import assert from 'node:assert/strict';
import test from 'node:test';
import { keccak256, toHex } from 'viem';

import { VENUS_ACTION_SELECTORS, capabilityText, countActions, declaredAction, type CapabilityRead } from '../src/lib/capability/match';

test('the Venus selectors are the real signatures', () => {
  for (const [selector, signature] of Object.entries(VENUS_ACTION_SELECTORS)) assert.equal(keccak256(toHex(signature)).slice(0, 10), selector, signature);
});

test('what an agent says about itself is read carefully, from real descriptions', () => {
  // Venus Rate Router: acts, with a guard that "never moves funds" on noise.
  assert.equal(declaredAction('rebalances the allocation toward the best yield. Hysteresis: so noise never moves funds. Wraps and unwraps BNB as needed; every move is an on-chain transaction.'), 'acts');
  assert.equal(declaredAction('Keeps BNB supplied to the Venus vBNB lending market.'), 'acts');
  // Hevo Grid: designs, does not place.
  assert.equal(declaredAction('as a deliverable a buyer (or their own bot) can execute. It designs the grid; it does not place live orders itself.'), 'advises');
  // Souk Health Guard: the caller supplies the values.
  assert.equal(declaredAction('from the collateral value and debt value the caller supplies'), 'undeclared');
  assert.equal(declaredAction('Read-only: it never signs or moves funds.'), 'advises');
});

test("Venus calls count only on a Venus market, and only when they succeeded", () => {
  const venus = new Set(['0xvbnb']);
  const counts = countActions(97, [
    { to: '0xVBNB', input: '0x1249c58b', ok: true, at: 100 },
    { to: '0xvbnb', input: '0x852a12e3ab', ok: true, at: 200 },
    { to: '0xvbnb', input: '0x852a12e3', ok: false, at: 300 },
    { to: '0xother', input: '0x1249c58b', ok: true, at: 400 },
  ], (a) => venus.has(a));
  assert.equal(counts.venus, 2);
  assert.equal(counts.latestAt, 200);
});

test('swaps through a PancakeSwap router count as swaps', () => {
  const counts = countActions(56, [{ to: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', input: '0x5ae401dc', ok: true, at: 1 }], () => false);
  assert.equal(counts.swaps, 1);
});

const read = (chainId: number, venus: number, latestAt: number | null): CapabilityRead => ({ chainId, wallet: '0xa', counts: { venus, swaps: 0, liquidity: 0, latestAt }, days: 30, checkedAt: 'x' });
const label = (c: number) => (c === 56 ? 'BNB Chain' : 'BNB Testnet');

test('the wording says what was seen, where, and never turns "not seen" into "cannot"', () => {
  const now = 10 * 86_400 * 1000;
  assert.equal(capabilityText({ category: 'yield', declared: 'acts', wallet: '0xa', reads: [read(56, 0, null), read(97, 14, 7 * 86_400)], chainLabel: label, now }).text, 'Seen doing its job: 14 Venus lending calls on BNB Testnet, latest 3 days ago');
  assert.equal(capabilityText({ category: 'yield', declared: 'acts', wallet: '0xa', reads: [read(56, 0, null)], chainLabel: label, now }).text, 'Says it acts; no Venus lending transactions from its agent wallet in the last 30 days');
  assert.equal(capabilityText({ category: 'yield', declared: 'undeclared', wallet: '0xa', reads: [read(56, 0, null)], chainLabel: label, now }).text, 'No Venus lending transactions from its agent wallet in the last 30 days');
  assert.equal(capabilityText({ category: 'rebalancing', declared: 'advises', wallet: '0xa', reads: [read(56, 0, null)], chainLabel: label, now }).text, 'No lending or swap transactions from its agent wallet in the last 30 days. It says it only advises');
  assert.equal(capabilityText({ category: 'token-safety', declared: 'acts', wallet: '0xa', reads: [], chainLabel: label }).seen, null);
  assert.equal(capabilityText({ category: 'yield', declared: 'acts', wallet: null, reads: [], chainLabel: label }).text, 'No agent wallet registered to read');
});
