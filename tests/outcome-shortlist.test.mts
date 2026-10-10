import assert from 'node:assert/strict';
import test from 'node:test';

import { outcomeShortlist } from '../src/lib/home/outcome-shortlist';

/**
 * The landing page's outcome shelf.
 *
 * Every case here is one the shelf got wrong in the browser before it was
 * fixed, not a hypothetical.
 */
function entry(opts: {
  name: string;
  owner: string;
  priced?: boolean;
  probes?: number;
  answered?: number;
  description?: string;
}) {
  const probes = opts.probes ?? 10;
  const answered = opts.answered ?? probes;
  return {
    listing: {
      category: 'yield',
      quote: opts.priced ? { priceU: 10n } : null,
      agent: {
        name: opts.name,
        description: opts.description ?? 'A yield agent.',
        owner_address: opts.owner,
        chain_id: 56,
        token_id: opts.name,
      },
    },
    record: { totalProbes: probes, totalAnswered: answered },
  } as never;
}

test('an agent that signed a price outranks a better-probed one that did not', () => {
  const picks = outcomeShortlist(
    [
      entry({ name: 'Unpriced', owner: '0xa', probes: 300, answered: 300 }),
      entry({ name: 'Priced', owner: '0xb', probes: 4, answered: 4, priced: true }),
    ],
    'yield',
  );

  assert.equal(
    (picks[0] as { listing: { agent: { name: string } } }).listing.agent.name,
    'Priced',
    'a shelf of agents nobody can hire is not a marketplace doorway',
  );
});

test('one publisher cannot take the whole shelf', () => {
  const picks = outcomeShortlist(
    [
      entry({ name: 'Clone A', owner: '0xsame', probes: 300 }),
      entry({ name: 'Clone B', owner: '0xsame', probes: 299 }),
      entry({ name: 'Clone C', owner: '0xsame', probes: 298 }),
      entry({ name: 'Other', owner: '0xother', probes: 5 }),
    ],
    'yield',
  );

  const owners = picks.map(
    (p) => (p as { listing: { agent: { owner_address: string } } }).listing.agent.owner_address,
  );
  assert.ok(owners.includes('0xother'), 'the second publisher never appeared');
  assert.equal(picks.length, 3);
});

test('non-production identities stay off a promotional shelf', () => {
  const picks = outcomeShortlist(
    [
      entry({
        name: 'Grid (test)',
        owner: '0xa',
        priced: true,
        description: 'TEST DEPLOYMENT — not for production use.',
      }),
      entry({ name: 'Real', owner: '0xb' }),
    ],
    'yield',
  );

  assert.deepEqual(
    picks.map((p) => (p as { listing: { agent: { name: string } } }).listing.agent.name),
    ['Real'],
  );
});

test('only the requested category is offered', () => {
  const other = entry({ name: 'Grid thing', owner: '0xa' });
  (other as unknown as { listing: { category: string } }).listing.category = 'grid-trading';

  const picks = outcomeShortlist([other, entry({ name: 'Yield thing', owner: '0xb' })], 'yield');
  assert.equal(picks.length, 1);
});
