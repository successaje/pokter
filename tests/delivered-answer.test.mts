import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import { briefText, flatText, readDeliveredAnswer, shapeLines, valueShape, type ValueShape } from '../src/lib/delivery/answer';

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

/*
 * A delivery's own data reached buyers as braces and quotes: any value
 * that was not flat and short was printed with JSON.stringify. Each
 * structure now has a layout, and the agent's values are kept as written.
 */
test('nested data lays out as rows, same-shaped records as a table, and nothing as JSON', () => {
  const markets = valueShape({ collateral: { BTC: { usd: 1463.53, liquidation_threshold: 0.8 } }, debt: { USDT: { usd: 871.34 } } });
  assert.deepEqual(markets, {
    kind: 'rows',
    more: 0,
    rows: [
      { label: 'collateral', value: { kind: 'rows', more: 0, rows: [{ label: 'BTC', value: { kind: 'text', text: 'usd 1463.53 · liquidation threshold 0.8' } }] } },
      { label: 'debt', value: { kind: 'rows', more: 0, rows: [{ label: 'USDT', value: { kind: 'text', text: 'usd 871.34' } }] } },
    ],
  });
  assert.equal(shapeLines(markets), 4, 'short enough to show unfolded');

  const unreachable = valueShape([
    { venue: 'Venus DAI', reason: 'No PancakeSwap v3 pool from FDUSD to DAI.' },
    { venue: 'Venus TUSD', reason: 'No PancakeSwap v3 pool from FDUSD to TUSD.' },
  ]);
  assert.deepEqual(unreachable, { kind: 'table', columns: ['venue', 'reason'], rows: [['Venus DAI', 'No PancakeSwap v3 pool from FDUSD to DAI.'], ['Venus TUSD', 'No PancakeSwap v3 pool from FDUSD to TUSD.']], more: 0 });

  /* Lists of plain values read as a list; empty values as a dash; a long flat object as rows, not one long line. */
  assert.deepEqual(valueShape(['mint', 'pause']), { kind: 'text', text: 'mint, pause' });
  assert.deepEqual(valueShape([]), { kind: 'empty' });
  assert.deepEqual(valueShape({ lower: 1800, upper: 2200, basis: 'your range' }), { kind: 'text', text: 'lower 1800 · upper 2200 · basis your range' });
  const restore = valueShape({ target_health_factor: 1.5, repay_usd: 90.79, note: 'Either alone restores the target. Added collateral counts at its market’s liquidation threshold.' });
  assert.equal(restore.kind, 'rows');

  /* Records that differ in shape, or that nest, are a list of rows; a long one is cut with a count of the rest. */
  const positions = valueShape(Array.from({ length: 23 }, (_, i) => ({ position: `#${i}`, range: { lower: 1, upper: 2, unit: 'TEST per Sue' }, fees: [{ token: 'TEST', amount: i }] })));
  assert.equal(positions.kind, 'list');
  assert.equal(positions.kind === 'list' && positions.items.length, 20);
  assert.equal(positions.kind === 'list' && positions.more, 3);

  /* JSON only past the depth a layout would be read at. */
  const deep = valueShape({ a: { b: { c: { d: { e: 1, f: [1, 2] } } } } });
  const json = (s: ValueShape): string[] =>
    s.kind === 'json' ? [s.text] : s.kind === 'rows' ? s.rows.flatMap((row) => json(row.value)) : s.kind === 'list' ? s.items.flatMap(json) : [];
  assert.deepEqual(json(deep), ['{"e":1,"f":[1,2]}']);
  assert.deepEqual(json(markets), []);
  assert.deepEqual(json(positions), []);
});

test('the answer view folds a long value and never prints a structure as JSON', () => {
  const view = readFileSync(new URL('../src/features/delivery/AnswerView.tsx', import.meta.url), 'utf8');
  assert.match(view, /if \(shapeLines\(shape\) <= FOLD_AFTER\) return <Shape shape=\{shape\} \/>;/);
  assert.doesNotMatch(view, /JSON\.stringify/);
  assert.match(view, /<th key=\{column\} scope="col"/);
});
