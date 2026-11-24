import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { Address } from 'viem';

/*
 * PokterBoard's ratings, read from the contract's own totals for every
 * listed agent wallet on BNB Smart Chain, at most hourly, and given to an
 * agent by the same wallet rule as its escrow record.
 */

const dir = mkdtempSync(join(tmpdir(), 'pokter-board-ratings-'));
process.env.REVIEW_DB_PATH = join(dir, 'reviews.db');
process.env.QUEST_DB_PATH = join(dir, 'quest.db');

const { refreshBoardRatings, agentBoardRating } = await import('../../src/lib/board/ratings');
const { getQuestStore } = await import('../../src/lib/quest/store');

const BOARD = '0x00000000000000000000000000000000000B0a2D';
const SOLO = '0x00000000000000000000000000000000000000a1';
const SHARED = '0x00000000000000000000000000000000000000a2';
const UNRATED = '0x00000000000000000000000000000000000000a3';
const TESTNET = '0x00000000000000000000000000000000000000a4';
const FLAKY = '0x00000000000000000000000000000000000000a5';

getQuestStore().saveAgentWallets([
  { wallet: SOLO, chainId: 56, tokenId: '101', name: 'Solo' },
  { wallet: SHARED, chainId: 56, tokenId: '102', name: 'Twin A' },
  { wallet: SHARED, chainId: 56, tokenId: '103', name: 'Twin B' },
  { wallet: UNRATED, chainId: 56, tokenId: '104', name: 'Unrated' },
  { wallet: TESTNET, chainId: 97, tokenId: '105', name: 'Testnet' },
  { wallet: FLAKY, chainId: 56, tokenId: '106', name: 'Flaky' },
]);

function board(ratings: Record<string, [bigint, bigint]>, { fail = new Set<string>(), from = {} as Record<string, number> } = {}) {
  const asked: string[] = [];
  const reader = {
    readContract: (async ({ address, functionName, args }: { address: Address; functionName: string; args: Address[] }) => {
      assert.equal(address.toLowerCase(), BOARD.toLowerCase());
      // A rated wallet is also asked what each of Pokter's own wallets gave it; `from` keys are "provider:reviewer".
      if (functionName === 'ratingFrom') return BigInt(from[`${args[0].toLowerCase()}:${args[1].toLowerCase()}`] ?? 0);
      assert.equal(functionName, 'ratingOf');
      const wallet = args[0].toLowerCase();
      asked.push(wallet);
      if (fail.has(wallet)) throw new Error('execution timeout');
      return ratings[wallet] ?? [0n, 0n];
    }) as never,
  };
  return { reader, asked };
}

const T = Date.parse('2026-11-25T12:00:00Z');

test('nothing is read or given while no board is set', async () => {
  delete process.env.POKTER_BOARD_ADDRESS;
  assert.deepEqual(await refreshBoardRatings({ reader: board({}).reader, now: T }), { enabled: false, read: 0, rated: 0, failed: 0 });
  assert.equal(agentBoardRating({ chain_id: 56, token_id: '101' }), null);
});

test('every board-chain wallet is read, a failed read leaves the clock unset, and a full pass holds for an hour', async () => {
  process.env.POKTER_BOARD_ADDRESS = BOARD;
  const first = board({ [SOLO]: [3n, 13n], [SHARED]: [2n, 10n] }, { fail: new Set([FLAKY]) });
  assert.deepEqual(await refreshBoardRatings({ reader: first.reader, now: T }), { enabled: true, read: 3, rated: 2, failed: 1 });
  assert.deepEqual(first.asked.sort(), [SOLO, SHARED, UNRATED, FLAKY].sort(), 'the testnet agent’s wallet is not asked');

  // The failed read means the pass did not cover everyone, so the next run reads again.
  const second = board({ [SOLO]: [4n, 17n], [SHARED]: [2n, 10n], [FLAKY]: [1n, 2n] });
  assert.deepEqual(await refreshBoardRatings({ reader: second.reader, now: T + 600_000 }), { enabled: true, read: 4, rated: 3, failed: 0 });

  const third = board({});
  assert.deepEqual(await refreshBoardRatings({ reader: third.reader, now: T + 1_200_000 }), { enabled: true, read: 0, rated: 0, failed: 0, fresh: true });
  assert.deepEqual(third.asked, []);
  const later = board({ [SOLO]: [5n, 22n] });
  assert.equal((await refreshBoardRatings({ reader: later.reader, now: T + 600_000 + 3_600_001 })).read, 4, 'read again once the hour is up');
});

test('a single wallet can be read at once, as after a review is recorded, without moving the hourly clock', async () => {
  process.env.POKTER_BOARD_ADDRESS = BOARD;
  const one = board({ [UNRATED]: [1n, 4n] });
  assert.deepEqual(await refreshBoardRatings({ reader: one.reader, now: T + 9_000_000, wallets: [UNRATED] }), { enabled: true, read: 1, rated: 1, failed: 0 });
  assert.deepEqual(one.asked, [UNRATED]);
  assert.equal(agentBoardRating({ chain_id: 56, token_id: '104' })?.reviewers, 1);
});

test('an agent gets its own wallet’s rating, and none for a shared wallet or another chain', () => {
  process.env.POKTER_BOARD_ADDRESS = BOARD;
  const solo = agentBoardRating({ chain_id: 56, token_id: '101' });
  assert.deepEqual(solo && { reviewers: solo.reviewers, stars: solo.stars, average: solo.average, wallet: solo.wallet.toLowerCase() }, { reviewers: 5, stars: 22, average: 4.4, wallet: SOLO });
  assert.equal(agentBoardRating({ chain_id: 56, token_id: '102' }), null, 'the board rates the wallet, and cannot say which twin earned it');
  assert.equal(agentBoardRating({ chain_id: 97, token_id: '105' }), null);
  assert.equal(agentBoardRating({ chain_id: 56, token_id: '999' }), null, 'an agent with no wallet read has none');
  // An agent the sweep has not read a wallet for yet uses its listing's wallet.
  assert.equal(agentBoardRating({ chain_id: 56, token_id: '998', agent_wallet: SOLO })?.reviewers, undefined, 'its listing wallet is Solo’s, which another agent holds');
});

test('a rating from one of Pokter’s own wallets is left out of the agent’s rating, and one only Pokter gave is no rating', async () => {
  process.env.POKTER_BOARD_ADDRESS = BOARD;
  const TEAM = '0x564cbb1c360af36681591f47af469913b6364431';
  // Solo: three holders gave 13 stars, one of them Pokter's (5). Unrated: only Pokter rated it.
  const read = board({ [SOLO]: [3n, 13n], [UNRATED]: [1n, 5n] }, { from: { [`${SOLO}:${TEAM}`]: 5, [`${UNRATED}:${TEAM}`]: 5 } });
  await refreshBoardRatings({ reader: read.reader, now: T + 50 * 3_600_000, wallets: [SOLO, UNRATED], team: [TEAM] });
  const solo = agentBoardRating({ chain_id: 56, token_id: '101' });
  assert.equal(solo?.reviewers, 2);
  assert.equal(solo?.stars, 8);
  assert.equal(solo?.average, 4);
  // Unrated had an earlier rating from a holder in this file; now that only Pokter's remains, it shows none.
  assert.equal(agentBoardRating({ chain_id: 56, token_id: '104' }), null);
});

test('the team wallets include the Agentic Wallet Pokter hires and reviews with', async () => {
  const { teamAddressSet } = await import('../../src/lib/team/wallets');
  assert.ok(teamAddressSet().has('0x564cbb1c360af36681591f47af469913b6364431'));
});
