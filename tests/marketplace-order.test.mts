import assert from 'node:assert/strict';
import test from 'node:test';

import { orderMarketplace } from '../src/lib/search/order';
import type { SearchableAgent } from '../src/lib/search/match';

function agent(name: string, opts: {
  jobs?: number; completed?: number; probes?: number; priced?: boolean; ratio?: number;
}): SearchableAgent {
  return {
    listing: {
      agent: { name, token_id: name, chain_id: 56 },
      attestationCount: 0,
      quote: opts.priced ? { priceU: '0.1', expiresAt: null } : null,
    },
    record: {
      totalProbes: opts.probes ?? 10,
      totalAnswered: opts.probes ?? 10,
      windows: [{ label: '24h', probes: 2, ratio: opts.ratio ?? 1 }],
    },
    history: opts.jobs === undefined ? undefined : {
      jobs: opts.jobs, completed: opts.completed ?? 0,
    },
  } as unknown as SearchableAgent;
}

const names = (xs: SearchableAgent[]) => xs.map((x) => x.listing.agent.name);

test('taking many jobs without finishing them does not earn the top slot', () => {
  // The real case: one agent holds seven funded escrows and completed one.
  const busy = agent('busy-but-undelivering', { jobs: 7, completed: 0, priced: true });
  const quiet = agent('delivered-once', { jobs: 1, completed: 1, priced: true });

  assert.deepEqual(
    names(orderMarketplace([busy, quiet], 'completed')),
    ['delivered-once', 'busy-but-undelivering'],
  );
});

test('completed work outranks merely having quoted a price', () => {
  const delivered = agent('delivered', { jobs: 2, completed: 2, priced: true });
  const justPriced = agent('priced-only', { jobs: 0, completed: 0, priced: true });

  assert.equal(
    names(orderMarketplace([justPriced, delivered], 'recommended'))[0],
    'delivered',
  );
});

test('an agent with no job history still sorts, as zero completions', () => {
  const unknown = agent('never-hired', {});
  const delivered = agent('delivered', { jobs: 1, completed: 1 });

  const out = names(orderMarketplace([unknown, delivered], 'completed'));
  assert.deepEqual(out, ['delivered', 'never-hired']);
});

test('ordering is stable when nothing distinguishes two agents', () => {
  const a = agent('a', { jobs: 1, completed: 1 });
  const b = agent('b', { jobs: 1, completed: 1 });
  assert.deepEqual(names(orderMarketplace([a, b], 'completed')), ['a', 'b']);
  assert.deepEqual(names(orderMarketplace([b, a], 'completed')), ['b', 'a']);
});
