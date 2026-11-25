import assert from 'node:assert/strict';
import test from 'node:test';

import { windowChains } from '../src/features/guides/window-chains';
import { BOARD_CHAIN_ID } from '../src/lib/board/contract';

/*
 * Which networks a guide's review window may speak for.
 *
 * The Agent ID guide quoted the window for every escrow in a paragraph
 * about recording a review on PokterBoard, which takes jobs funded on
 * mainnet only. A newcomer reading it was given a testnet figure beside a
 * rule that can never apply to a testnet job, and told in effect that
 * their testnet hire was reviewable. It is not: the board refuses any
 * chain but 56, which `board-agent-review` and `board-contract` already
 * hold.
 *
 * This holds the other half — that a passage about one network can ask
 * for that network and get nothing else.
 */

const BOTH = [56, 97];

test('asked for one network, it yields that one and no other', () => {
  assert.deepEqual(windowChains(BOTH, BOARD_CHAIN_ID), [56]);
  /* The same property the other way round, so it cannot pass by always keeping the first. */
  assert.deepEqual(windowChains(BOTH, 97), [97]);
});

test('asked for nothing in particular, it keeps every escrow', () => {
  /* The other guides apply to both networks and must go on saying so. */
  assert.deepEqual(windowChains(BOTH).sort(), BOTH.slice().sort());
  assert.equal(windowChains([]).length, 0);
});

test('mainnet is named first, wherever it sits in the list', () => {
  /*
   * A reader on one network should not have to look past the other to
   * find theirs, and mainnet is where money actually moves.
   */
  assert.equal(windowChains([97, 56])[0], 56);
  assert.equal(windowChains([56, 97])[0], 56);
});

test('a network the escrows do not have yields nothing rather than everything', () => {
  /*
   * The failure that matters: a filter that silently falls back to the
   * whole list would put the testnet window back in the board paragraph
   * the first time an id stopped matching.
   */
  assert.deepEqual(windowChains(BOTH, 1), []);
});
