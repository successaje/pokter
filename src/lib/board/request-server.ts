import 'server-only';

import { getAddress, type Address, type Hex } from 'viem';

import { acceptsProposals, type Brief } from '@/lib/briefs/model';
import { boardCloseRequestCall, boardPostRequestCall, requestBriefHash } from './requests';
import { holdsAgentId, simulateBoardCall } from './server';

/**
 * Where a request stands on PokterBoard, for its page and its poster's
 * wallet: posted or not, and what its poster can do there now.
 *
 * An open request can be posted once its poster's wallet holds an Agent ID;
 * a posted one can be closed there once it stops taking proposals on
 * Pokter. Whether the board would accept either is the board's own answer:
 * the poster's call is simulated, so every rule is the contract's.
 */
export type BoardRequestStatus =
  | { available: false }
  | {
      available: true;
      board: Address;
      posted: true;
      requestId: string;
      transactionHash: Hex;
      expiresAt: string;
      closed: boolean;
      closedTransactionHash: Hex | null;
      /** The poster can close the post now: the request has stopped taking proposals and the board would accept it. */
      canClose: boolean;
      reason?: string;
    }
  | {
      available: true;
      board: Address;
      posted: false;
      eligible: boolean;
      /** Whether the poster's wallet holds an Agent ID; null when it was not asked. */
      holder: boolean | null;
      reason?: string;
      /** What the poster's wallet posts, when eligible: the request's hash and when the post stops standing, in seconds. */
      call?: { briefHash: Hex; expiresAt: string };
    };

export interface BoardRequestDeps {
  holds?: (wallet: Address) => Promise<boolean>;
  simulate?: typeof simulateBoardCall;
  now?: number;
}

export async function boardRequestStatus(brief: Brief, board: Address | null, deps: BoardRequestDeps = {}): Promise<BoardRequestStatus> {
  if (!board) return { available: false };
  const now = deps.now ?? Date.now();
  const simulate = deps.simulate ?? simulateBoardCall;
  const poster = getAddress(brief.poster);

  if (brief.board) {
    const closed = Boolean(brief.board.closedTx);
    const base = {
      available: true as const,
      board,
      posted: true as const,
      requestId: brief.board.requestId,
      transactionHash: brief.board.tx,
      expiresAt: brief.board.expiresAt,
      closed,
      closedTransactionHash: brief.board.closedTx,
    };
    if (closed || acceptsProposals(brief, now)) return { ...base, canClose: false };
    const verdict = await simulate(boardCloseRequestCall(brief.board.requestId, board), poster);
    return verdict.ok ? { ...base, canClose: true } : { ...base, canClose: false, reason: verdict.reason };
  }

  if (!acceptsProposals(brief, now)) {
    return { available: true, board, posted: false, eligible: false, holder: null, reason: 'This request is not taking proposals, so there is nothing to post.' };
  }
  if (!(await (deps.holds ?? holdsAgentId)(poster))) {
    return { available: true, board, posted: false, eligible: false, holder: false, reason: 'The wallet that posted this request holds no Agent ID.' };
  }
  const call = boardPostRequestCall(brief, board, now);
  const verdict = await simulate(call, poster);
  if (!verdict.ok) return { available: true, board, posted: false, eligible: false, holder: true, reason: verdict.reason };
  return { available: true, board, posted: false, eligible: true, holder: true, call: { briefHash: requestBriefHash(brief), expiresAt: call.args[1].toString() } };
}
