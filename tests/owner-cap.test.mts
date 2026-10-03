import assert from 'node:assert/strict';
import test from 'node:test';

import { capPerOwner } from '../src/lib/agents/diversity';

const listing = (owner: string | null, id: string) => ({
  id,
  agent: { owner_address: owner },
});

/*
 * The case this exists for: one publisher held seventeen listings in the
 * yield category — sequential mints of the same agent differing only by an
 * NFT tier word, so `collapseClones`, which keys on the exact description,
 * kept every one. They were 63% of that category.
 */
test('one publisher cannot hold a whole shelf', () => {
  const ranked = [
    ...Array.from({ length: 17 }, (_, i) => listing('0xBORT', `bort-${i}`)),
    listing('0xOTHER', 'other-1'),
  ];

  const capped = capPerOwner(ranked, 2);

  assert.equal(capped.filter((l) => l.agent.owner_address === '0xBORT').length, 2);
  assert.equal(
    capped.some((l) => l.id === 'other-1'),
    true,
    'another publisher must still appear',
  );
});

test('the cap keeps the best, because the input is ranked', () => {
  const capped = capPerOwner(
    [listing('0xA', 'best'), listing('0xA', 'second'), listing('0xA', 'third')],
    2,
  );
  assert.deepEqual(capped.map((l) => l.id), ['best', 'second']);
});

test('owner matching ignores address casing', () => {
  const capped = capPerOwner(
    [listing('0xAbC', '1'), listing('0xabc', '2'), listing('0xABC', '3')],
    2,
  );
  assert.equal(capped.length, 2, 'the same wallet in three casings is one publisher');
});

/*
 * A missing owner is not evidence that two listings share one. Grouping
 * them would silently hide unrelated agents whose registry record happens
 * to be incomplete.
 */
test('unattributed listings are never capped against each other', () => {
  const capped = capPerOwner(
    [listing(null, '1'), listing(null, '2'), listing(null, '3'), listing(undefined as unknown as null, '4')],
    2,
  );
  assert.equal(capped.length, 4);
});

test('publishers under the cap are untouched', () => {
  const ranked = [listing('0xA', '1'), listing('0xB', '2'), listing('0xC', '3')];
  assert.deepEqual(capPerOwner(ranked, 2).map((l) => l.id), ['1', '2', '3']);
});
