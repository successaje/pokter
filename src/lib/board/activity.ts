import { getAddress, parseEventLogs, type Hex, type Log } from 'viem';

import { BOARD_ABI } from './contract';

/**
 * What has happened on PokterBoard, read from its own events: who posted a
 * request, who closed one, who recorded a review, and of which job.
 *
 * The board keeps current ratings and requests in its storage, but only its
 * events say who reviewed what, so the public record of its use is built
 * from them. Nothing here reads the chain: `board/activity-server.ts`
 * scans the events and the store keeps them; this turns them into the
 * counts and the list the board's page shows.
 */

export type BoardEventKind = 'review' | 'request' | 'close';

export interface BoardEvent {
  tx: Hex;
  logIndex: number;
  blockNumber: number;
  /** When its block was made, as an ISO time; null until read. */
  time: string | null;
  kind: BoardEventKind;
  /** The wallet that acted, lower-cased: the reviewer, or the request's poster. Null for a close the board alone cannot attribute. */
  wallet: string | null;
  jobId?: string;
  provider?: string;
  rating?: number;
  flags?: number;
  commentHash?: Hex;
  requestId?: string;
  briefHash?: Hex;
  /** When a request's post stops standing, in seconds. */
  expiresAt?: number;
}

/** The board's events in a set of logs, in chain order. Logs from any other contract are ignored. */
export function boardEventsFromLogs(logs: Log[], board: string): BoardEvent[] {
  const own = logs.filter((log) => getAddress(log.address) === getAddress(board));
  const events: BoardEvent[] = [];
  for (const log of parseEventLogs({ abi: BOARD_ABI, logs: own })) {
    const base = { tx: log.transactionHash as Hex, logIndex: Number(log.logIndex), blockNumber: Number(log.blockNumber), time: null };
    if (log.eventName === 'Reviewed') {
      events.push({
        ...base,
        kind: 'review',
        wallet: log.args.reviewer.toLowerCase(),
        jobId: log.args.jobId.toString(),
        provider: log.args.provider.toLowerCase(),
        rating: Number(log.args.rating),
        flags: Number(log.args.flags),
        commentHash: log.args.commentHash,
      });
    } else if (log.eventName === 'RequestPosted') {
      events.push({
        ...base,
        kind: 'request',
        wallet: log.args.poster.toLowerCase(),
        requestId: log.args.requestId.toString(),
        briefHash: log.args.briefHash,
        expiresAt: Number(log.args.expiresAt),
      });
    } else if (log.eventName === 'RequestClosed') {
      events.push({ ...base, kind: 'close', wallet: null, requestId: log.args.requestId.toString() });
    }
  }
  return events.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}

export interface BoardActivity {
  /** Distinct wallets holding an Agent ID that posted a request or recorded a review, Pokter's own left out. */
  holders: number;
  /** Requests posted and reviews recorded by those wallets. */
  requests: number;
  reviews: number;
  /** Requests and reviews from Pokter's own wallets: its tests, counted apart. */
  team: { wallets: number; requests: number; reviews: number };
  /** Every event, newest first, each close attributed to its request's poster. */
  latest: Array<BoardEvent & { team: boolean }>;
}

/**
 * The board's use, as its page counts it. Only posting and reviewing count
 * as use: a close is the same person tidying up after a request. Pokter's
 * own wallets are counted apart, never as holders.
 */
export function boardActivity(events: readonly BoardEvent[], team: ReadonlySet<string>): BoardActivity {
  const posters = new Map(events.filter((e) => e.kind === 'request').map((e) => [e.requestId!, e.wallet]));
  const attributed = events.map((event) => {
    const wallet = event.kind === 'close' ? (posters.get(event.requestId!) ?? null) : event.wallet;
    return { ...event, wallet, team: wallet !== null && team.has(wallet) };
  });
  const uses = attributed.filter((e) => e.kind !== 'close' && e.wallet !== null);
  const outside = uses.filter((e) => !e.team);
  const ours = uses.filter((e) => e.team);
  return {
    holders: new Set(outside.map((e) => e.wallet)).size,
    requests: outside.filter((e) => e.kind === 'request').length,
    reviews: outside.filter((e) => e.kind === 'review').length,
    team: {
      wallets: new Set(ours.map((e) => e.wallet)).size,
      requests: ours.filter((e) => e.kind === 'request').length,
      reviews: ours.filter((e) => e.kind === 'review').length,
    },
    latest: attributed.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex),
  };
}
