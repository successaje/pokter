import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SUGGESTION_MIN_SAMPLE,
  catalogueSuggestion,
  suggestionLabel,
  suggestionNote,
  suggestionsByCategory,
} from '../src/lib/find/suggested';

/* Mainnet $U: suggestions are medians of $U prices only (see discovery-tokens.test). */
const U = '0xcE24439F2D9C6a2289F741120FE202248B666666';
const priced = (category: string, ...prices: number[]) =>
  prices.map((priceU) => ({ category, priceU, currency: U }));

test('a category with enough signed prices uses its own median', () => {
  const s = suggestionsByCategory(priced('rebalancing', 0.1, 0.1, 0.1, 0.5));
  const r = s.get('rebalancing')!;
  assert.equal(r.basis, 'category');
  assert.equal(r.u, 0.1);
  assert.equal(r.sample, 4);
});

test('a category too thin to have a median falls back to the catalogue', () => {
  const s = suggestionsByCategory([
    ...priced('rebalancing', 0.1, 0.1, 0.1, 0.1),
    ...priced('grid', 5),
  ]);
  const thin = s.get('grid')!;
  assert.ok(1 < SUGGESTION_MIN_SAMPLE);
  assert.equal(thin.basis, 'catalogue');
  assert.equal(thin.u, 0.1, 'takes the whole catalogue, not its own single price');
});

test('medians are rounded to a figure a person would type', () => {
  // Raw median of these is 0.075, which reads like a calculation, not a price.
  const s = suggestionsByCategory(priced('x', 0.05, 0.05, 0.1, 0.1));
  assert.equal(s.get('x')!.u, 0.05);
});

test('prices that cannot be paid are not evidence of anything', () => {
  const s = suggestionsByCategory([
    ...priced('x', 0.1, 0.1, 0.1),
    { category: 'x', priceU: 0, currency: U },
    { category: 'x', priceU: Number.NaN, currency: U },
    { category: 'x', priceU: -1, currency: U },
  ]);
  assert.equal(s.get('x')!.sample, 3);
});

test('an empty catalogue still yields a usable default', () => {
  const s = suggestionsByCategory([]);
  assert.equal(s.size, 0);
  const fallback = catalogueSuggestion(s);
  assert.equal(fallback.basis, 'default');
  assert.ok(fallback.u > 0);
});

test('a suggestion never reads like a signed price', () => {
  const s = suggestionsByCategory(priced('rebalancing', 0.1, 0.1, 0.1))
    .get('rebalancing')!;
  assert.ok(suggestionLabel(s).startsWith('~'), 'the tilde carries the distinction');
  const note = suggestionNote(s, 'Rebalancing');
  assert.match(note, /has not quoted/);
  assert.match(note, /may decline/);
  assert.match(note, /Rebalancing/);
});
