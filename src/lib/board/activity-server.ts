import 'server-only';

import { getAbiItem, type Address, type Log } from 'viem';

import { historyClient } from '@/lib/erc8183/history-client';
import { getReviewStore } from '@/lib/reviews/store';
import { teamWalletSet } from '@/lib/team/server';
import { boardActivity, boardEventsFromLogs, type BoardActivity } from './activity';
import { BOARD_ABI, BOARD_CHAIN_ID } from './contract';
import { boardContract } from './server';

/**
 * Scan PokterBoard's events into the store, from its deploy block forward,
 * a chunk of blocks at a time, keeping where it got to. Run from the sweep,
 * so after the first catch-up each run reads only the blocks since the last.
 *
 * Read where old logs are served (`historyClient`: NodeReal first). A chunk
 * that fails leaves the cursor where it was, so nothing is skipped; the
 * next run asks again.
 */

const CHUNK = 5_000n;
/**
 * How far behind the reported head the scan stops. Public nodes sit behind
 * a load balancer whose nodes disagree on the head by dozens of blocks: the
 * head came from one, the logs from another that refused a range "beyond
 * current head block". Twenty blocks (about ten seconds) also keeps clear of
 * any block that could still be reorganised.
 */
const BEHIND_HEAD = 20n;

type ScanClient = {
  getBlockNumber(): Promise<bigint>;
  getLogs(args: { address: Address; events: readonly unknown[]; fromBlock: bigint; toBlock: bigint }): Promise<Log[]>;
  getBlock(args: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
};

const EVENTS = [getAbiItem({ abi: BOARD_ABI, name: 'Reviewed' }), getAbiItem({ abi: BOARD_ABI, name: 'RequestPosted' }), getAbiItem({ abi: BOARD_ABI, name: 'RequestClosed' })];

export async function indexBoardActivity({
  client = historyClient(BOARD_CHAIN_ID) as unknown as ScanClient,
  deadlineAt = Number.POSITIVE_INFINITY,
  now = () => new Date().toISOString(),
}: { client?: ScanClient; deadlineAt?: number; now?: () => string } = {}): Promise<{ enabled: boolean; events: number; scannedTo: number | null; caughtUp: boolean }> {
  const board = boardContract();
  if (!board || board.fromBlock === null) return { enabled: false, events: 0, scannedTo: null, caughtUp: false };
  const store = getReviewStore();
  let next = BigInt(store.boardScan(board.address)?.nextBlock ?? board.fromBlock);
  const latest = (await client.getBlockNumber()) - BEHIND_HEAD;
  let found = 0;
  while (next <= latest && Date.now() < deadlineAt) {
    const to = next + CHUNK - 1n < latest ? next + CHUNK - 1n : latest;
    const logs = await client.getLogs({ address: board.address, events: EVENTS, fromBlock: next, toBlock: to });
    const events = boardEventsFromLogs(logs, board.address);
    /* The time of each block that holds an event, so the page can say when, not only which block. */
    const times = new Map<number, string>();
    for (const blockNumber of new Set(events.map((e) => e.blockNumber))) {
      const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
      times.set(blockNumber, new Date(Number(block.timestamp) * 1000).toISOString());
    }
    store.saveBoardEvents(board.address, events.map((e) => ({ ...e, time: times.get(e.blockNumber) ?? null })));
    found += events.length;
    next = to + 1n;
    store.setBoardScan(board.address, Number(next), now());
  }
  return { enabled: true, events: found, scannedTo: Number(next - 1n), caughtUp: next > latest };
}

/** The board's use as its page shows it, from what the scan has stored; null while no board is set. */
export function boardActivityNow(): (BoardActivity & { board: Address; fromBlock: number | null; scannedAt: string | null; scannedTo: number | null }) | null {
  const board = boardContract();
  if (!board) return null;
  const store = getReviewStore();
  const scan = store.boardScan(board.address);
  return {
    ...boardActivity(store.boardEvents(board.address), teamWalletSet()),
    board: board.address,
    fromBlock: board.fromBlock === null ? null : Number(board.fromBlock),
    scannedAt: scan?.scannedAt ?? null,
    scannedTo: scan ? scan.nextBlock - 1 : null,
  };
}
