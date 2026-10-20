import assert from 'node:assert/strict';
import test from 'node:test';

import { onChainSummary, type CapabilityRead } from '../src/lib/capability/match';

const label = (chainId: number) => (chainId === 56 ? 'BNB Chain' : 'Testnet');
const now = Date.parse('2026-10-20T12:00:00Z');
const read = (venus: number, swaps = 0): CapabilityRead => ({ chainId: 56, wallet: '0xabc', counts: { venus, swaps, liquidity: 0, latestAt: venus || swaps ? now / 1000 - 86_400 : null }, days: 30, checkedAt: '2026-10-20T00:00:00Z' });

test('a yield agent seen supplying to Venus from its own wallet acts', () => {
  const s = onChainSummary({ category: 'yield', description: 'Supplies to Venus.', wallet: '0xabc', reads: [read(4)], chainLabel: label, now });
  assert.equal(s?.kind, 'acts');
  assert.match(s!.text, /4 Venus lending calls on BNB Chain, latest 1 day ago/);
});

test('an agent that says it executes but whose wallet shows none of it claims', () => {
  const s = onChainSummary({ category: 'grid-trading', description: 'It executes the trades on PancakeSwap.', wallet: '0xabc', reads: [read(0)], chainLabel: label, now });
  assert.equal(s?.kind, 'claims');
});

test('a read-only agent with no transactions advises', () => {
  const s = onChainSummary({ category: 'health-factor', description: 'Read-only: it never signs or moves funds.', wallet: '0xabc', reads: [read(0)], chainLabel: label, now });
  assert.equal(s?.kind, 'advises');
});

test('a category whose job is advice advises without a read', () => {
  assert.equal(onChainSummary({ category: 'token-safety', description: '', wallet: null, reads: [], chainLabel: label, now })?.kind, 'advises');
});

test('nothing read yet, or no wallet, says nothing rather than guessing', () => {
  assert.equal(onChainSummary({ category: 'yield', description: 'Supplies to Venus.', wallet: '0xabc', reads: [], chainLabel: label, now }), null);
  assert.equal(onChainSummary({ category: 'yield', description: 'Supplies to Venus.', wallet: null, reads: [], chainLabel: label, now }), null);
});
