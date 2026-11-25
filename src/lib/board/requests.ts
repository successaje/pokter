import { decodeFunctionData, getAddress, keccak256, parseEventLogs, stringToBytes, type Address, type Hex, type Log } from 'viem';

import { briefMessage, type Brief } from '@/lib/briefs/model';
import { BOARD_ABI } from './contract';

/**
 * A Pokter request, posted on PokterBoard by its poster's own wallet.
 *
 * A request on Pokter is already signed: its poster's wallet signed the
 * terms (`briefMessage`). Posting it on the board adds what a signature
 * cannot: that the poster holds an Agent ID, so it comes from one distinct
 * person, checked by the contract itself. The board keeps only the hash of
 * the signed text and when the post stops standing; the text stays on
 * Pokter, and anyone can hash it again and compare.
 *
 * Shared by the browser, which sends the post, and the server, which checks
 * the transaction before showing it. Nothing here reads the chain.
 */

/** How long a post stands on the board for a request with no closing date: the board needs one, and Pokter's state stays the authority. */
export const BOARD_REQUEST_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What a request's board hash covers: the exact text its poster signed. */
export type SignedRequest = Pick<
  Brief,
  'poster' | 'postedAt' | 'title' | 'budgetU' | 'chainId' | 'paymentToken' | 'deliverDays' | 'brief' | 'acceptance' | 'failSignals' | 'closesAt' | 'category' | 'targetBuilder'
>;

/** The board's `briefHash` for a request: keccak256 of the UTF-8 text its poster signed. */
export function requestBriefHash(request: SignedRequest): Hex {
  return keccak256(stringToBytes(briefMessage(request)));
}

/**
 * When the post stops standing on the board, in seconds: the request's own
 * closing date, or `BOARD_REQUEST_DAYS` from now for one that stays open
 * until somebody is chosen.
 */
export function boardRequestExpiry(request: Pick<Brief, 'closesAt'>, now: number = Date.now()): bigint {
  const closes = request.closesAt ? Date.parse(request.closesAt) : Number.NaN;
  const end = Number.isFinite(closes) && closes > now ? closes : now + BOARD_REQUEST_DAYS * DAY_MS;
  return BigInt(Math.floor(end / 1000));
}

/** The call the poster's wallet makes to post the request on the board. */
export function boardPostRequestCall(request: SignedRequest, board: Address, now: number = Date.now()) {
  return {
    address: board,
    abi: BOARD_ABI,
    functionName: 'postRequest' as const,
    args: [requestBriefHash(request), boardRequestExpiry(request, now)] as const,
  };
}

/** The call the poster's wallet makes to close its post on the board. */
export function boardCloseRequestCall(requestId: string, board: Address) {
  return { address: board, abi: BOARD_ABI, functionName: 'closeRequest' as const, args: [BigInt(requestId)] as const };
}

export type BoardRequestReading =
  | { ok: true; action: 'post'; requestId: string; expiresAt: string }
  | { ok: true; action: 'close'; requestId: string }
  | { ok: false; status: number; error: string };

/**
 * What a transaction did to this request on the board, read from the
 * transaction and its receipt alone: sent by the request's poster, to the
 * board, posting exactly this request's hash or closing its post, and
 * confirmed by the board's own event. Anything else is refused in words.
 */
export function readBoardRequestTx(input: {
  request: SignedRequest & Pick<Brief, 'board'>;
  board: Address;
  tx: { from: Address; to: Address | null; input: Hex };
  succeeded: boolean;
  logs: Log[];
}): BoardRequestReading {
  const { request, board, tx } = input;
  if (!input.succeeded) return { ok: false, status: 409, error: 'The transaction failed on chain, so nothing was posted.' };
  if (!tx.to || getAddress(tx.to) !== getAddress(board)) return { ok: false, status: 409, error: 'The transaction was not sent to PokterBoard.' };
  if (getAddress(tx.from) !== getAddress(request.poster)) return { ok: false, status: 403, error: 'The transaction was not sent by the wallet that posted this request.' };
  let call;
  try {
    call = decodeFunctionData({ abi: BOARD_ABI, data: tx.input });
  } catch {
    return { ok: false, status: 409, error: 'The transaction is not a PokterBoard request.' };
  }
  const fromBoard = (log: Log) => getAddress(log.address) === getAddress(board);

  if (call.functionName === 'postRequest') {
    const [hash] = call.args;
    if (hash !== requestBriefHash(request)) return { ok: false, status: 409, error: 'The transaction posts a different request: its hash is not this request’s text.' };
    const posted = parseEventLogs({ abi: BOARD_ABI, eventName: 'RequestPosted', logs: input.logs })
      .filter(fromBoard)
      .find((log) => log.args.briefHash === hash && getAddress(log.args.poster) === getAddress(request.poster));
    if (!posted) return { ok: false, status: 409, error: 'The board did not record the post.' };
    return { ok: true, action: 'post', requestId: posted.args.requestId.toString(), expiresAt: new Date(Number(posted.args.expiresAt) * 1000).toISOString() };
  }

  if (call.functionName === 'closeRequest') {
    const link = request.board;
    if (!link) return { ok: false, status: 409, error: 'This request is not posted on PokterBoard, so there is nothing to close.' };
    const [requestId] = call.args;
    if (requestId.toString() !== link.requestId) return { ok: false, status: 409, error: 'The transaction closes a different request on the board.' };
    const closed = parseEventLogs({ abi: BOARD_ABI, eventName: 'RequestClosed', logs: input.logs })
      .filter(fromBoard)
      .some((log) => log.args.requestId === requestId);
    if (!closed) return { ok: false, status: 409, error: 'The board did not record the close.' };
    return { ok: true, action: 'close', requestId: link.requestId };
  }

  return { ok: false, status: 409, error: 'The transaction is not a PokterBoard request.' };
}
