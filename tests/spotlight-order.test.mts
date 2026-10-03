import assert from 'node:assert/strict';
import test from 'node:test';

import {
  rankedFor,
  type SpotlightEntry,
} from '../src/lib/home/spotlight-order';

type Opts = {
  name: string;
  quote: boolean;
  probes: number;
  answered: number;
  lastSeen?: string;
};

/* Only the fields the comparator reads. */
const entry = ({ name, quote, probes, answered, lastSeen }: Opts) =>
  ({
    listing: {
      agent: { name },
      quote: quote ? { priceU: '100000000000000000' } : null,
      record: { totalProbes: probes, totalAnswered: answered },
    },
    record: {
      totalProbes: probes,
      totalAnswered: answered,
      lastSeen: lastSeen ?? null,
    },
  }) as unknown as SpotlightEntry;

const nameOf = (entry: SpotlightEntry) =>
  (entry.listing as unknown as { agent: { name: string } }).agent.name;

/*
 * The live case this exists for: the homepage spotlight led with an agent
 * carrying 298 probes at 100% and the words "No signed price" — the first
 * thing a visitor to a marketplace saw was something not for sale.
 */
test('a priced agent leads an unpriced one with a perfect record', () => {
  const ranked = rankedFor('recommended', [
    entry({ name: 'perfect but unbuyable', quote: false, probes: 298, answered: 298 }),
    entry({ name: 'buyable', quote: true, probes: 40, answered: 34 }),
  ]);
  assert.equal(nameOf(ranked[0]), 'buyable');
});

test('among priced agents the stronger record still wins', () => {
  const ranked = rankedFor('recommended', [
    entry({ name: 'weaker', quote: true, probes: 100, answered: 50 }),
    entry({ name: 'stronger', quote: true, probes: 100, answered: 95 }),
  ]);
  assert.equal(nameOf(ranked[0]), 'stronger');
});

test('the latest-evidence tab still orders by recency first', () => {
  const ranked = rankedFor('recent', [
    entry({ name: 'older', quote: true, probes: 100, answered: 100, lastSeen: '2026-09-01T00:00:00Z' }),
    entry({ name: 'newer', quote: false, probes: 5, answered: 1, lastSeen: '2026-10-01T00:00:00Z' }),
  ]);
  assert.equal(nameOf(ranked[0]), 'newer');
});

test('ranking does not mutate the input array', () => {
  const entries = [
    entry({ name: 'a', quote: false, probes: 10, answered: 10 }),
    entry({ name: 'b', quote: true, probes: 1, answered: 1 }),
  ];
  const before = entries.map(nameOf);
  rankedFor('recommended', entries);
  assert.deepEqual(
    entries.map(nameOf),
    before,
  );
});
