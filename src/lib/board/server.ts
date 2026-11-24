import 'server-only';

import { createPublicClient, getAbiItem, getAddress, isAddress, type Abi, type Address, type Hex, type Log } from 'viem';
import { bsc } from 'viem/chains';

import { readTransport } from '@/lib/chain/rpc';
import { publicReadUrls } from '@/lib/chain/transport';
import { historyClient } from '@/lib/erc8183/history-client';
import type { VerifiedReview } from '@/lib/reviews/model';
import { AGENT_ID_ABI, AGENT_ID_REGISTRY, BOARD_ABI, BOARD_CHAIN_ID, BOARD_REFUSAL, boardReviewCall } from './contract';

/**
 * The deployed board, from `POKTER_BOARD_ADDRESS`, and the block it was
 * deployed in, from `POKTER_BOARD_FROM_BLOCK`, where reading its reviews
 * starts. Null while no board is set: nothing offers or reads it then.
 */
export function boardContract(): { address: Address; fromBlock: bigint | null } | null {
  const address = process.env.POKTER_BOARD_ADDRESS?.trim();
  if (!address || !isAddress(address, { strict: false })) return null;
  const block = process.env.POKTER_BOARD_FROM_BLOCK?.trim();
  return { address: getAddress(address), fromBlock: block && /^\d+$/.test(block) ? BigInt(block) : null };
}

type BoardClient = ReturnType<typeof makeClient>;
function makeClient() {
  return createPublicClient({ chain: bsc, transport: readTransport(BOARD_CHAIN_ID, publicReadUrls(BOARD_CHAIN_ID, process.env.BSC_MAINNET_RPC_URL)), batch: { multicall: true } });
}
let client: BoardClient | null = null;
/** What the board is read through; a test passes its own. */
export type BoardReader = Pick<BoardClient, 'readContract' | 'simulateContract'>;
export function boardClient(): BoardReader {
  return (client ??= makeClient());
}

/*
 * An Agent ID cannot be transferred, so a holder stays one for a long
 * while; a wallet without one may claim one at any time. Each answer is
 * kept for as long as it is likely to stay true.
 */
const HOLDER_TTL_MS = 24 * 3_600_000;
const NON_HOLDER_TTL_MS = 10 * 60_000;
const holders = new Map<string, { holds: boolean; until: number }>();

/** Whether a wallet holds an Agent ID, read from the registry. */
export async function holdsAgentId(wallet: Address, reader: Pick<BoardReader, 'readContract'> = boardClient(), now = Date.now()): Promise<boolean> {
  const key = wallet.toLowerCase();
  const known = holders.get(key);
  if (known && known.until > now) return known.holds;
  const balance = await reader.readContract({ address: AGENT_ID_REGISTRY, abi: AGENT_ID_ABI, functionName: 'balanceOf', args: [getAddress(wallet)] });
  const holds = balance > 0n;
  holders.set(key, { holds, until: now + (holds ? HOLDER_TTL_MS : NON_HOLDER_TTL_MS) });
  return holds;
}

/**
 * Which of these wallets hold an Agent ID, lowercased, or null when the
 * registry could not be read in time: an unread answer is never "none".
 */
export async function agentIdHolderSet(
  wallets: readonly string[],
  { reader = boardClient(), timeoutMs = 3_000 }: { reader?: Pick<BoardReader, 'readContract'>; timeoutMs?: number } = {},
): Promise<Set<string> | null> {
  const unique = [...new Set(wallets.map((w) => w.toLowerCase()))].filter((w) => isAddress(w));
  if (unique.length === 0) return new Set();
  const reads = Promise.all(unique.map(async (wallet) => ((await holdsAgentId(wallet as Address, reader)) ? wallet : null)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const held = await Promise.race([reads, late]);
    return held ? new Set(held.filter((w): w is Address => w !== null)) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether the board would accept this review from its buyer now, by
 * simulating the buyer's own call. Every rule the contract enforces is
 * checked by the contract itself, so this cannot drift from it.
 */
export async function simulateBoardReview(
  review: VerifiedReview,
  board: Address,
  reader: Pick<BoardReader, 'simulateContract'> = boardClient(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const call = boardReviewCall(review, board);
  try {
    await reader.simulateContract({ address: call.address, abi: call.abi, functionName: call.functionName, args: call.args, account: getAddress(review.buyer) });
    return { ok: true };
  } catch (error) {
    const name = revertName(error);
    if (name && BOARD_REFUSAL[name]) return { ok: false, reason: BOARD_REFUSAL[name] };
    throw error;
  }
}

/*
 * The custom error a reverted call names, found by walking the error's
 * causes by name: a class check fails when two copies of viem are loaded.
 */
function revertName(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 8; depth += 1) {
    const { name, data, cause } = current as { name?: string; data?: { errorName?: string }; cause?: unknown };
    if (name === 'ContractFunctionRevertedError') return data?.errorName;
    current = cause;
  }
  return undefined;
}

/**
 * Whether the board would take a call from this wallet now, judged by
 * simulating that wallet's own call, so every rule is the contract's. A
 * refusal comes back in the board's words; anything else is thrown.
 */
export async function simulateBoardCall(
  call: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] },
  account: Address,
  reader: Pick<BoardReader, 'simulateContract'> = boardClient(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await reader.simulateContract({ address: call.address, abi: call.abi, functionName: call.functionName, args: call.args, account: getAddress(account) } as never);
    return { ok: true };
  } catch (error) {
    const name = revertName(error);
    if (name && BOARD_REFUSAL[name]) return { ok: false, reason: BOARD_REFUSAL[name] };
    throw error;
  }
}

/** A board transaction as Pokter checks it: who sent it where, with what, and what the board logged. */
export interface BoardTransaction {
  from: Address;
  to: Address | null;
  input: Hex;
  succeeded: boolean;
  logs: Log[];
}

type TxReader = { getTransaction(args: { hash: Hex }): Promise<{ from: Address; to: Address | null; input: Hex }>; getTransactionReceipt(args: { hash: Hex }): Promise<{ status: string; logs: Log[] }> };

/** Read a sent transaction and its receipt from the board's chain. */
export async function readBoardTransaction(hash: Hex, reader: TxReader = makeClient() as unknown as TxReader): Promise<BoardTransaction> {
  const [tx, receipt] = await Promise.all([reader.getTransaction({ hash }), reader.getTransactionReceipt({ hash })]);
  return { from: tx.from, to: tx.to, input: tx.input, succeeded: receipt.status === 'success', logs: receipt.logs };
}

/*
 * How far back a post or close is looked for when the wallet returned no
 * transaction, as when its owner approved it later in the Binance App:
 * about an hour of blocks, as far as public nodes serve logs.
 */
const RECENT_BLOCKS = 8_000n;

/** The poster's most recent post of this hash on the board, or close of this request, in the last hour or so of blocks. */
export async function findBoardRequestTransaction(
  board: Address,
  find: { post: { poster: Address; briefHash: Hex } } | { close: { requestId: bigint } },
): Promise<Hex | null> {
  const client = historyClient(BOARD_CHAIN_ID);
  const latest = await client.getBlockNumber();
  const fromBlock = latest > RECENT_BLOCKS ? latest - RECENT_BLOCKS : 0n;
  if ('post' in find) {
    const logs = await client.getLogs({ address: board, event: getAbiItem({ abi: BOARD_ABI, name: 'RequestPosted' }), args: { poster: find.post.poster }, fromBlock, toBlock: latest });
    return logs.filter((log) => log.args.briefHash === find.post.briefHash).at(-1)?.transactionHash ?? null;
  }
  const logs = await client.getLogs({ address: board, event: getAbiItem({ abi: BOARD_ABI, name: 'RequestClosed' }), args: { requestId: find.close.requestId }, fromBlock, toBlock: latest });
  return logs.at(-1)?.transactionHash ?? null;
}

/** Whether a job is already reviewed on the board, by anyone's means. */
export async function boardReviewed(jobId: string, board: Address, reader: Pick<BoardReader, 'readContract'> = boardClient()): Promise<boolean> {
  return reader.readContract({ address: board, abi: BOARD_ABI, functionName: 'reviewed', args: [BigInt(jobId)] });
}
