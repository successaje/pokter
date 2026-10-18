import assert from 'node:assert/strict';
import test from 'node:test';

import { briefText, flatText, readDeliveredAnswer } from '../src/lib/delivery/answer';

const manifest = (content: unknown, metadata: Record<string, unknown> = {}) => JSON.stringify({ metadata, response: { content: typeof content === 'string' ? content : JSON.stringify(content) } });

test('a health-factor report leads with its summary, time, sources and limits', () => {
  const a = readDeliveredAnswer(manifest({ account: '0xabc', as_of: { block: '128000000', time: '2026-10-18T09:00:00Z' }, health_factor: 1.42, summary: 'Health factor 1.42: a 29% drop in collateral would liquidate it.', sources: ['Venus Comptroller getAccountLiquidity'], note: 'Venus Core Pool only.' }, { producer: 'Brinkwatch' }));
  assert.equal(a.result, 'Health factor 1.42: a 29% drop in collateral would liquidate it.');
  assert.deepEqual(a.asOf, { time: '2026-10-18T09:00:00Z', block: '128000000' });
  assert.deepEqual(a.sources, ['Venus Comptroller getAccountLiquidity']);
  assert.deepEqual(a.limitations, ['Venus Core Pool only.']);
  assert.deepEqual(a.fields.map((f) => f.label), ['account', 'health factor']);
  assert.equal(a.producer, 'Brinkwatch');
});

test("Pokter's brief envelope is unwrapped to the buyer's own words", () => {
  const a = readDeliveredAnswer(manifest({ task: JSON.stringify({ task: 'Rank Venus markets for 1000 USDT' }), answer: 'Lend on vUSDT at 4.1%.', report: { apy: '4.1%' } }));
  assert.equal(a.asked, 'Rank Venus markets for 1000 USDT');
  assert.equal(a.result, 'Lend on vUSDT at 4.1%.');
  assert.deepEqual(a.fields.map((f) => f.label), ['report']);
});

test('assumptions and warnings are limitations, and plain text is kept as text', () => {
  const a = readDeliveredAnswer(manifest({ question: 'Best grid?', assumptions: ['Fees 0.25%', 'No slippage'], warning: 'Range is wide.' }));
  assert.deepEqual(a.limitations, ['Fees 0.25%', 'No slippage', 'Range is wide.']);
  assert.equal(readDeliveredAnswer(manifest('Just a sentence.', { generated_at: '2026-10-18T10:00:00Z' })).raw, 'Just a sentence.');
});

test('markup in a delivery stays text: nothing is interpreted', () => {
  const a = readDeliveredAnswer(manifest({ summary: '<script>alert(1)</script>' }));
  assert.equal(a.result, '<script>alert(1)</script>');
});

test('a manifest that is not JSON comes back whole as raw text', () => {
  assert.equal(readDeliveredAnswer('not json').raw, 'not json');
});

test('small objects read as text, and a brief envelope as its words', () => {
  assert.equal(flatText({ lower: 1800, upper: 2200, basis: 'your range' }), 'lower 1800 · upper 2200 · basis your range');
  assert.equal(flatText({ grid: { levels: 5 } }), null);
  assert.equal(briefText(JSON.stringify({ task: 'Grid plan for ETH', data: { grids: 4 } })), 'Grid plan for ETH');
  assert.equal(briefText('Plain words'), 'Plain words');
});
