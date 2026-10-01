import assert from 'node:assert/strict';
import test from 'node:test';

import { matchesQuery } from '../src/lib/search/match';
import { orderMarketplace } from '../src/lib/search/order';
import { parseQuery } from '../src/lib/search/query';

function entry({ name, probes, answered, recent, price }: { name: string; probes: number; answered: number; recent: number | null; price?: number }) {
  return {
    listing: {
      attestationCount: 0,
      confidence: 1,
      category: 'yield',
      agent: { chain_id: 56, token_id: name, name, supported_protocols: ['a2a'] },
      quote: price === undefined ? null : { priceU: price, observedAt: new Date().toISOString() },
    },
    record: {
      totalProbes: probes,
      totalAnswered: answered,
      observedDays: 2,
      days: [],
      windows: [{ label: '24h', days: 1, probes: recent === null ? 0 : 2, answered: recent === null ? 0 : Math.round(recent * 2), ratio: recent, medianMs: null }],
      firstSeen: null,
      lastSeen: null,
      longestOutage: null,
    },
  } as never;
}

test('recommended order puts actionable and recently responsive agents first', () => {
  const silent = entry({ name: 'silent', probes: 20, answered: 20, recent: 0 });
  const working = entry({ name: 'working', probes: 20, answered: 20, recent: 1, price: 0.1 });
  assert.equal(orderMarketplace([silent, working], 'recommended')[0], working);
});

test('lowest price keeps unpriced agents behind signed prices', () => {
  const unpriced = entry({ name: 'unpriced', probes: 20, answered: 20, recent: 1 });
  const expensive = entry({ name: 'expensive', probes: 20, answered: 20, recent: 1, price: 0.5 });
  const cheap = entry({ name: 'cheap', probes: 20, answered: 20, recent: 1, price: 0.1 });
  assert.deepEqual(orderMarketplace([unpriced, expensive, cheap], 'price').map((item: { listing: { agent: { name: string } } }) => item.listing.agent.name), ['cheap', 'expensive', 'unpriced']);
});

test('responsive means a successful observation in the recent window', () => {
  assert.equal(matchesQuery(entry({ name: 'working', probes: 20, answered: 20, recent: 1 }), parseQuery('is:responsive')), true);
  assert.equal(matchesQuery(entry({ name: 'stale', probes: 20, answered: 20, recent: null }), parseQuery('is:responsive')), false);
  assert.equal(matchesQuery(entry({ name: 'down', probes: 20, answered: 20, recent: 0 }), parseQuery('is:responsive')), false);
});

