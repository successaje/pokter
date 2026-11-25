import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeAbiParameters, encodeEventTopics, type Address, type Hex, type Log } from 'viem';

import { boardActivity, boardEventsFromLogs } from '../src/lib/board/activity';
import { BOARD_ABI } from '../src/lib/board/contract';

/*
 * PokterBoard's use, read from its events: each review and request becomes
 * one event, a close is attributed to its request's poster, and the count
 * of holders is distinct people, with Pokter's own wallets counted apart.
 */

const BOARD: Address = '0x00000000000000000000000000000000000B0A2D';
const ALICE = '0x00000000000000000000000000000000000a11ce';
const BOB = '0x0000000000000000000000000000000000000b0b';
const TEAM = '0x564cbb1c360af36681591f47af469913b6364431';
const AGENT = '0x071044a5a92f6c90cf9d08d5059921da734d19e7';

let n = 0;
function log(eventName: 'Reviewed' | 'RequestPosted' | 'RequestClosed', args: Record<string, unknown>, blockNumber: number, address: Address = BOARD): Log {
  const topics = encodeEventTopics({ abi: BOARD_ABI, eventName, args } as never) as [Hex, ...Hex[]];
  const data =
    eventName === 'Reviewed'
      ? encodeAbiParameters([{ type: 'uint8' }, { type: 'uint8' }, { type: 'bytes32' }], [args.rating as number, args.flags as number, args.commentHash as Hex])
      : eventName === 'RequestPosted'
        ? encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint64' }], [args.briefHash as Hex, args.expiresAt as bigint])
        : '0x';
  n += 1;
  return { address, topics, data, blockNumber: BigInt(blockNumber), logIndex: n, transactionHash: `0x${n.toString(16).padStart(64, '0')}`, blockHash: null, transactionIndex: 0, removed: false } as unknown as Log;
}

const HASH = `0x${'ab'.repeat(32)}` as Hex;
const logs = [
  log('RequestPosted', { requestId: 1n, poster: ALICE, briefHash: HASH, expiresAt: 1_798_000_000n }, 100),
  log('Reviewed', { jobId: 57301n, provider: AGENT, reviewer: BOB, rating: 4, flags: 11, commentHash: HASH }, 120),
  log('Reviewed', { jobId: 57238n, provider: AGENT, reviewer: TEAM, rating: 5, flags: 11, commentHash: HASH }, 130),
  log('RequestPosted', { requestId: 2n, poster: ALICE, briefHash: HASH, expiresAt: 1_798_000_000n }, 140),
  log('RequestClosed', { requestId: 1n }, 150),
  log('RequestPosted', { requestId: 3n, poster: BOB, briefHash: HASH, expiresAt: 1_798_000_000n }, 160, '0x00000000000000000000000000000000DEADBEEF'),
];

test('each review and request on the board becomes one event, in chain order, and other contracts’ logs are ignored', () => {
  const events = boardEventsFromLogs([...logs].reverse(), BOARD);
  assert.deepEqual(events.map((e) => e.kind), ['request', 'review', 'review', 'request', 'close']);
  const review = events[1];
  assert.equal(review.wallet, BOB);
  assert.equal(review.jobId, '57301');
  assert.equal(review.provider, AGENT);
  assert.equal(review.rating, 4);
  assert.equal(events[0].requestId, '1');
  assert.equal(events[0].expiresAt, 1_798_000_000);
  assert.equal(events[4].wallet, null, 'a close names no wallet on its own');
});

test('holders are distinct people who posted or reviewed; Pokter’s own wallets are counted apart; a close is its poster tidying up', () => {
  const activity = boardActivity(boardEventsFromLogs(logs, BOARD), new Set([TEAM]));
  assert.equal(activity.holders, 2, 'Alice posted twice and Bob reviewed once');
  assert.equal(activity.requests, 2);
  assert.equal(activity.reviews, 1);
  assert.deepEqual(activity.team, { wallets: 1, requests: 0, reviews: 1 });
  assert.equal(activity.latest[0].kind, 'close');
  assert.equal(activity.latest[0].wallet, ALICE, 'the close is attributed to the request’s poster');
  assert.equal(activity.latest.find((e) => e.wallet === TEAM)?.team, true);
});

test('an empty board counts nobody', () => {
  assert.deepEqual(boardActivity([], new Set()), { holders: 0, requests: 0, reviews: 0, team: { wallets: 0, requests: 0, reviews: 0 }, latest: [] });
});
