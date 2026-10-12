import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTIVE_TTL_MS, isAdoptable } from '../src/features/studio/active-registration';

/*
 * Whether a fresh mount adopts a registration already in flight.
 *
 * A new draft's id is `draft-${Date.now()}`, minted again on every
 * mount, so a remount during registration orphaned both the saved result
 * and the saved recovery and showed an empty form. Agent 56/372022 was
 * registered that way: two transactions landed and the screen said
 * nothing. The danger is not the missing message, it is paying to mint a
 * second identity.
 */

const NOW = 1_800_000_000_000;

test('a registration from moments ago is adopted', () => {
  assert.equal(isAdoptable({ draftId: 'draft-1', at: NOW - 5_000 }, NOW), true);
  assert.equal(isAdoptable({ draftId: 'draft-1', at: NOW }, NOW), true);
});

test('one from long ago is not, so a new draft starts clean', () => {
  assert.equal(isAdoptable({ draftId: 'draft-1', at: NOW - ACTIVE_TTL_MS - 1 }, NOW), false);
});

test('a clock that moved backwards does not lose a mint', () => {
  /* A future timestamp means the device's clock changed, not that the
     registration is stale. Refusing it would drop the record that keeps
     somebody from registering twice. */
  assert.equal(isAdoptable({ draftId: 'draft-1', at: NOW + 60_000 }, NOW), true);
});

test('nothing, or a malformed record, is never adopted', () => {
  assert.equal(isAdoptable(null, NOW), false);
  assert.equal(isAdoptable({ draftId: '', at: NOW } as never, NOW), false);
  assert.equal(isAdoptable({ draftId: 'draft-1' } as never, NOW), false);
  assert.equal(isAdoptable({ draftId: 'draft-1', at: Number.NaN }, NOW), false);
  assert.equal(isAdoptable({ at: NOW } as never, NOW), false);
});
