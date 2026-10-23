import assert from 'node:assert/strict';
import test from 'node:test';

import { compareRow, orderRows } from '../src/lib/hire/compare-quotes';

const base = { chainId: 56, tokenId: '1', name: 'A', task: 'Check CAKE before I buy', missing: [], failure: null, deliveryMs: null };
const mainnet = { label: 'BNB Chain · Mainnet', real: true };

test('a signed price makes a priced row with a hire link that carries the brief', () => {
  const r = compareRow({ ...base, quote: { label: '0.05 $U', network: mainnet, expiresAt: '2026-10-23T08:00:00Z' } });
  assert.equal(r.state, 'priced');
  assert.equal(r.price?.label, '0.05 $U');
  assert.equal(r.hireUrl, '/hire/56/1?task=Check%20CAKE%20before%20I%20buy');
});

test('no price but missing inputs: the row asks for them instead of looking broken', () => {
  const r = compareRow({ ...base, quote: null, missing: [{ label: 'Token address', question: 'Which token?' }], failure: 'It declined.' });
  assert.equal(r.state, 'needs-input');
  assert.deepEqual(r.missing, [{ label: 'Token address', question: 'Which token?' }]);
});

test('no price and nothing missing: the reason is said, never a guess at a price', () => {
  const r = compareRow({ ...base, quote: null, failure: 'Its endpoint could not be reached.' });
  assert.equal(r.state, 'no-quote');
  assert.equal(r.price, null);
  assert.match(r.reason ?? '', /could not be reached/);
  assert.equal(compareRow({ ...base, quote: null }).reason, 'It did not return a signed price for this brief.');
});

test('a quote in a token Pokter cannot name is not shown as a price', () => {
  assert.equal(compareRow({ ...base, quote: { label: null, network: null, expiresAt: null } }).state, 'no-quote');
});

test('priced rows first and cheapest first, then those needing input, then the rest in the order asked', () => {
  const p = (tokenId: string, label: string) => compareRow({ ...base, tokenId, quote: { label, network: mainnet, expiresAt: null } });
  const rows = [
    compareRow({ ...base, tokenId: 'x', quote: null }),
    p('b', '0.10 $U'),
    compareRow({ ...base, tokenId: 'n', quote: null, missing: [{ label: 'Wallet', question: 'Which wallet?' }] }),
    p('a', '0.05 $U'),
  ];
  const ordered = orderRows(rows, (r) => (r.price ? Number.parseFloat(r.price.label) : null));
  assert.deepEqual(ordered.map((r) => r.tokenId), ['a', 'b', 'n', 'x']);
});

test('candidates: hireable, in the brief’s category, signed prices first, at most three', async () => {
  const { comparisonCandidates } = await import('../src/lib/hire/compare-quotes');
  const row = (id: string, category: string, priceU: number | null, hirable = true, nameOnly = false) => ({ id, category, priceU, hirable, nameOnly });
  const rows = [row('sniper', 'token-safety', null), row('planner', 'rebalancing', 0.1), row('touchstone', 'token-safety', 0.05), row('check', 'token-safety', 0.03), row('off', 'token-safety', 0.02, false), row('named', 'token-safety', 0.01, true, true), row('nodata', 'token-safety', null)];
  assert.deepEqual(comparisonCandidates(rows, 'token-safety').map((r) => r.id), ['touchstone', 'check', 'sniper']);
  assert.deepEqual(comparisonCandidates(rows, null).map((r) => r.id), ['planner', 'touchstone', 'check']);
});
