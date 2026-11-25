import 'server-only';

import { getAddress, type Address } from 'viem';

import { getQuestStore } from '@/lib/quest/store';
import { getReviewStore } from '@/lib/reviews/store';
import { teamWalletSet } from '@/lib/team/server';
import { BOARD_ABI, BOARD_CHAIN_ID } from './contract';
import { boardClient, boardContract, type BoardReader } from './server';

/**
 * An agent's rating on PokterBoard: how many distinct people holding an
 * Agent ID rated it, and their average. Read from the contract's own
 * totals, which it keeps one current rating per holder for, so nothing
 * here depends on reading old logs.
 */
export interface BoardRating {
  board: Address;
  wallet: Address;
  reviewers: number;
  stars: number;
  average: number;
  readAt: string;
}

const REFRESH_MS = 3_600_000;
const BATCH = 100;

/**
 * A wallet's rating without the ratings Pokter's own wallets gave it. The
 * board counts every Agent ID holder, and a Pokter wallet that holds one is
 * still Pokter: its review of an agent, Pokter's own agents above all, is
 * not a buyer's verdict. `teamRatings` are those wallets' current ratings of
 * this provider, 0 for none.
 */
export function withoutTeamRatings(rating: { reviewers: number; stars: number }, teamRatings: readonly number[]): { reviewers: number; stars: number } {
  const given = teamRatings.filter((stars) => stars > 0);
  return {
    reviewers: Math.max(0, rating.reviewers - given.length),
    stars: Math.max(0, rating.stars - given.reduce((sum, stars) => sum + stars, 0)),
  };
}

/**
 * Read every listed agent wallet's rating from the board, at most hourly.
 * Each read is one `ratingOf` call, batched by multicall, so a run costs a
 * few requests however many wallets there are. A wallet whose read fails
 * keeps its last rating until the next run.
 */
export async function refreshBoardRatings({
  reader = boardClient(),
  now = Date.now(),
  deadlineAt = Number.POSITIVE_INFINITY,
  wallets,
  team,
}: { reader?: Pick<BoardReader, 'readContract'>; now?: number; deadlineAt?: number; wallets?: string[]; team?: Iterable<string> } = {}): Promise<{ enabled: boolean; read: number; rated: number; failed: number; fresh?: boolean }> {
  const board = boardContract();
  if (!board) return { enabled: false, read: 0, rated: 0, failed: 0 };
  const store = getReviewStore();
  const last = store.boardReadAt(board.address);
  if (!wallets && last && now - Date.parse(last) < REFRESH_MS) return { enabled: true, read: 0, rated: 0, failed: 0, fresh: true };

  const targets = [...new Set((wallets ?? boardWallets()).map((w) => w.toLowerCase()))];
  const teamWallets = [...(team ?? teamWalletSet())];
  const readAt = new Date(now).toISOString();
  let read = 0;
  let failed = 0;
  const rated: Array<{ provider: string; reviewers: number; stars: number }> = [];
  const rows: Array<{ provider: string; reviewers: number; stars: number }> = [];
  for (let i = 0; i < targets.length; i += BATCH) {
    if (Date.now() > deadlineAt) break;
    const batch = targets.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((wallet) => reader.readContract({ address: board.address, abi: BOARD_ABI, functionName: 'ratingOf', args: [getAddress(wallet)] })),
    );
    const found: Array<{ provider: string; reviewers: number; stars: number }> = [];
    results.forEach((result, j) => {
      if (result.status === 'rejected') return void (failed += 1);
      read += 1;
      const [reviewers, stars] = result.value as readonly [bigint, bigint];
      if (reviewers > 0n) found.push({ provider: batch[j], reviewers: Number(reviewers), stars: Number(stars) });
    });
    /* Only wallets someone rated are asked about Pokter's own: a handful of reads, not one per wallet per team member. */
    for (const row of found) {
      const team = await Promise.all(
        teamWallets.map((member) =>
          reader
            .readContract({ address: board.address, abi: BOARD_ABI, functionName: 'ratingFrom', args: [getAddress(row.provider), getAddress(member)] })
            .then((value) => Number(value))
            .catch(() => null),
        ),
      );
      /* A team rating that could not be read leaves the wallet's last rating standing until the next run. */
      if (team.some((value) => value === null)) {
        failed += 1;
        read -= 1;
        continue;
      }
      const own = withoutTeamRatings(row, team as number[]);
      /* Saved even at zero, so a wallet only Pokter rated replaces any earlier row and shows no rating. */
      rows.push({ provider: row.provider, ...own });
      if (own.reviewers > 0) rated.push({ provider: row.provider, ...own });
    }
  }
  store.saveBoardRatings(board.address, rows, readAt);
  /* A full pass that read every wallet sets the clock; a partial one or a few named wallets do not. */
  if (!wallets && read + failed === targets.length && failed === 0) store.setBoardReadAt(board.address, readAt);
  return { enabled: true, read, rated: rated.length, failed };
}

/** The wallets of agents registered on the board's chain, as the escrow index last read them. */
function boardWallets(): string[] {
  return getQuestStore()
    .allAgentWallets()
    .filter((row) => row.chainId === BOARD_CHAIN_ID)
    .map((row) => row.wallet);
}

type BoardAgent = { chain_id: number; token_id: string; agent_wallet?: string | null };

/**
 * Whether the board can rate an agent at all, and its rating if so, by the
 * same wallet rule as its escrow record (`agentRecordJobs`): the wallet the
 * registry names. Null when it cannot: no board, an agent not registered on
 * BNB Smart Chain where the board and its escrow are, no known wallet, or a
 * wallet shared with another agent, since the board rates wallets and could
 * not say which agent earned it. Otherwise `rating` is null until someone
 * outside Pokter has rated it, so a card can tell "not rated yet" from
 * "cannot be rated here".
 */
export function agentBoardStanding(agent: BoardAgent): { rating: BoardRating | null } | null {
  const board = boardContract();
  if (!board || agent.chain_id !== BOARD_CHAIN_ID) return null;
  try {
    const index = getQuestStore();
    const wallet = index.walletOf(agent.chain_id, agent.token_id) ?? agent.agent_wallet?.toLowerCase() ?? null;
    if (!wallet) return null;
    const sharing = new Set([...index.agentsOnWallet(agent.chain_id, wallet).map((a) => a.tokenId), agent.token_id]);
    if (sharing.size > 1) return null;
    const row = getReviewStore().boardRating(board.address, wallet);
    if (!row || row.reviewers === 0) return { rating: null };
    return { rating: { board: board.address, wallet: getAddress(wallet), reviewers: row.reviewers, stars: row.stars, average: row.stars / row.reviewers, readAt: row.readAt } };
  } catch {
    return null;
  }
}

/** An agent's board rating, when the board can rate it and someone has (`agentBoardStanding`). */
export function agentBoardRating(agent: BoardAgent): BoardRating | null {
  return agentBoardStanding(agent)?.rating ?? null;
}
