import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { encodeAbiParameters, encodeEventTopics, type Hex, type Log } from 'viem';

import { BOARD_ABI } from '../../src/lib/board/contract';

/*
 * The scan of PokterBoard's events: from the deploy block forward, a chunk
 * at a time, keeping where it got to, so a run cut short resumes and a
 * failed chunk is asked again; and the page's counts from what it stored.
 */

const dir = mkdtempSync(join(tmpdir(), 'pokter-board-activity-'));
process.env.REVIEW_DB_PATH = join(dir, 'reviews.db');

const { indexBoardActivity, boardActivityNow } = await import('../../src/lib/board/activity-server');

const BOARD = '0x00000000000000000000000000000000000B0a2D';
const ALICE = '0x00000000000000000000000000000000000a11ce';
const HASH = `0x${'ab'.repeat(32)}` as Hex;

function posted(requestId: bigint, blockNumber: number): Log {
  return {
    address: BOARD,
    topics: encodeEventTopics({ abi: BOARD_ABI, eventName: 'RequestPosted', args: { requestId, poster: ALICE } }) as [Hex, ...Hex[]],
    data: encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint64' }], [HASH, 1_798_000_000n]),
    blockNumber: BigInt(blockNumber),
    logIndex: 0,
    transactionHash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
    blockHash: null,
    transactionIndex: 0,
    removed: false,
  } as unknown as Log;
}

function chain(latest: bigint, logs: Log[], { failFrom = new Set<bigint>() } = {}) {
  const ranges: Array<[bigint, bigint]> = [];
  return {
    ranges,
    client: {
      // The scan stops 20 blocks behind the head a node reports, so the head is set 20 past where it should end.
      getBlockNumber: async () => latest + 20n,
      getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
        ranges.push([fromBlock, toBlock]);
        if (failFrom.has(fromBlock)) throw new Error('range too large');
        return logs.filter((l) => (l.blockNumber as bigint) >= fromBlock && (l.blockNumber as bigint) <= toBlock);
      },
      getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: 1_795_000_000n + blockNumber }),
    },
  };
}

test('without a board, or without its deploy block, nothing is scanned', async () => {
  delete process.env.POKTER_BOARD_ADDRESS;
  assert.equal((await indexBoardActivity({ client: chain(10n, []).client as never })).enabled, false);
  assert.equal(boardActivityNow(), null);
  process.env.POKTER_BOARD_ADDRESS = BOARD;
  delete process.env.POKTER_BOARD_FROM_BLOCK;
  assert.equal((await indexBoardActivity({ client: chain(10n, []).client as never })).enabled, false);
});

test('the scan starts at the deploy block, reads in chunks, stores what it finds with its time, and remembers where it got to', async () => {
  process.env.POKTER_BOARD_ADDRESS = BOARD;
  process.env.POKTER_BOARD_FROM_BLOCK = '1000';
  const run = chain(12_500n, [posted(1n, 1_200), posted(2n, 11_000)]);
  const result = await indexBoardActivity({ client: run.client as never, now: () => '2026-11-24T00:00:00.000Z' });
  assert.deepEqual(result, { enabled: true, events: 2, scannedTo: 12_500, caughtUp: true });
  assert.deepEqual(run.ranges, [[1_000n, 5_999n], [6_000n, 10_999n], [11_000n, 12_500n]]);
  const now = boardActivityNow();
  assert.equal(now?.requests, 2);
  assert.equal(now?.holders, 1);
  assert.equal(now?.latest[0].time, new Date((1_795_000_000 + 11_000) * 1000).toISOString());
  assert.equal(now?.scannedTo, 12_500);

  // The next run reads only what is new.
  const next = chain(12_600n, [posted(3n, 12_550)]);
  await indexBoardActivity({ client: next.client as never });
  assert.deepEqual(next.ranges, [[12_501n, 12_600n]]);
  assert.equal(boardActivityNow()?.requests, 3);
});

test('a chunk that fails leaves the cursor before it, so the next run asks again and nothing is skipped', async () => {
  process.env.POKTER_BOARD_ADDRESS = BOARD;
  process.env.POKTER_BOARD_FROM_BLOCK = '1000';
  const failing = chain(20_000n, [posted(4n, 15_000)], { failFrom: new Set([12_601n]) });
  await assert.rejects(indexBoardActivity({ client: failing.client as never }));
  assert.equal(boardActivityNow()?.scannedTo, 12_600, 'the cursor did not move past the failed range');
  const retry = chain(20_000n, [posted(4n, 15_000)]);
  await indexBoardActivity({ client: retry.client as never });
  assert.equal(retry.ranges[0][0], 12_601n);
  assert.equal(boardActivityNow()?.requests, 4);
});
