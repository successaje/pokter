import 'server-only';

import { encodeFunctionData, getAddress, isAddress, isHash, type Address, type Hex } from 'viem';

import { briefMessage, parseBriefContent, type Brief, type BriefContent } from '@/lib/briefs/model';
import { briefIdFor, targetBuilderProblem } from '@/lib/briefs/publish';
import { BOARD_CHAIN_ID } from './contract';
import { boardPostRequestCall, readBoardRequestTx, requestBriefHash } from './requests';
import { findBoardRequestTransaction, holdsAgentId, readBoardTransaction, simulateBoardCall, type BoardTransaction } from './server';

/**
 * A new request posted on PokterBoard straight from its poster's wallet,
 * for a wallet that cannot sign the request's text.
 *
 * A request is normally signed: the poster's wallet signs `briefMessage`,
 * so a builder can see that wallet agreed to these exact terms. An
 * Agentic Wallet signs only EIP-712 typed data, never a plain message, so
 * it cannot do that. It can send a transaction, though, and a board post
 * from it records the poster's wallet and keccak256 of the same text.
 * That is the same proof, made on chain: the request is published with
 * the post as its proof (`proof: 'board'`) and no signature.
 *
 * Two steps, as with a review written on the board. `prepareBoardRequest`
 * checks the request and returns the unsigned call, with the exact text it
 * commits to; the wallet previews and sends it once its owner approves.
 * `recordBoardRequest` then checks the transaction and publishes the
 * request. Nothing is stored in between: the second step is given back
 * what the first returned, and the transaction decides whether it is true.
 */

/** How old a request's own time may be when it is recorded: a post approved later the same day is still the request it was. */
export const RECORD_WINDOW_MS = 24 * 3_600_000;
/** How far ahead of Pokter's clock a request's time may be. */
const CLOCK_SKEW_MS = 5 * 60_000;

/** What the record step is given back: the request's terms exactly as Pokter read them, without the amount it works out again. */
export type BoardRequestContent = Omit<BriefContent, 'budgetRaw'>;

export type Refusal = { ok: false; status: number; error: string };

export interface PreparedBoardRequest {
  ok: true;
  /** The id the request will have once recorded: the same digest of the same text a signed request gets. */
  id: string;
  /** The exact text the post commits to. Its keccak256 is `briefHash`. */
  text: string;
  briefHash: Hex;
  /** When the post stops standing on the board, as an ISO time. */
  expiresAt: string;
  call: { binanceChainId: string; to: Address; data: Hex; value: '0' };
  /** The body for the record step, plus the transaction hash when the wallet returns one. */
  record: { poster: Address; postedAt: string; content: BoardRequestContent };
}

export interface PrepareDeps {
  holds?: (wallet: Address) => Promise<boolean>;
  simulate?: typeof simulateBoardCall;
  targetProblem?: typeof targetBuilderProblem;
  now?: number;
}

function termsOf(content: BriefContent): BoardRequestContent {
  const terms: Partial<BriefContent> = { ...content };
  delete terms.budgetRaw;
  return terms as BoardRequestContent;
}

/** Check a new request, and return the board call that posts it from the poster's wallet. */
export async function prepareBoardRequest(input: { poster: unknown; content: unknown }, board: Address | null, deps: PrepareDeps = {}): Promise<PreparedBoardRequest | Refusal> {
  const now = deps.now ?? Date.now();
  if (typeof input.poster !== 'string' || !isAddress(input.poster, { strict: false })) {
    return { ok: false, status: 400, error: 'poster is required: the wallet that posts the request, which must hold an Agent ID.' };
  }
  const read = parseBriefContent(input.content, now);
  if (!read.ok) return { ok: false, status: 400, error: read.error };
  if (!board) return { ok: false, status: 409, error: 'PokterBoard is not open yet.' };
  const targetProblem = await (deps.targetProblem ?? targetBuilderProblem)(read.content);
  if (targetProblem) return { ok: false, status: 409, error: targetProblem };

  const poster = getAddress(input.poster);
  if (!(await (deps.holds ?? holdsAgentId)(poster))) {
    return {
      ok: false,
      status: 409,
      error: 'This wallet holds no Agent ID, and PokterBoard takes requests only from wallets that hold one. Nothing was posted.',
    };
  }

  const postedAt = new Date(now).toISOString();
  const signed = { ...read.content, poster, postedAt };
  const call = boardPostRequestCall(signed, board, now);
  const verdict = await (deps.simulate ?? simulateBoardCall)(call, poster);
  if (!verdict.ok) return { ok: false, status: 409, error: verdict.reason };

  const text = briefMessage(signed);
  return {
    ok: true,
    id: briefIdFor(text),
    text,
    briefHash: requestBriefHash(signed),
    expiresAt: new Date(Number(call.args[1]) * 1000).toISOString(),
    call: { binanceChainId: String(BOARD_CHAIN_ID), to: board, data: encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args }), value: '0' },
    record: { poster, postedAt, content: termsOf(read.content) },
  };
}

export interface RecordStore {
  get(id: string): Brief | null;
  add(brief: Brief): void;
  recordBoardPost(id: string, post: { requestId: string; tx: Hex; expiresAt: string }): boolean;
}

export interface RecordDeps {
  store: RecordStore;
  find?: typeof findBoardRequestTransaction;
  read?: (hash: Hex) => Promise<BoardTransaction>;
  targetProblem?: typeof targetBuilderProblem;
  now?: number;
}

/**
 * Publish a request once its poster's wallet has posted it on the board.
 *
 * Nothing the caller says is trusted beyond the terms and which
 * transaction to look at: the transaction must come from the poster, be
 * sent to the board, post exactly the hash of these terms and this time,
 * and be confirmed by the board's own event (`readBoardRequestTx`). With
 * no transaction given, the last hour or so of the board's events is
 * searched for it. `created` is false when the request was already here:
 * recorded before, or signed and now posted on the board as well.
 */
export async function recordBoardRequest(
  input: { poster: unknown; postedAt: unknown; content: unknown; transactionHash?: unknown },
  board: Address | null,
  deps: RecordDeps,
): Promise<{ ok: true; created: boolean; brief: Brief } | Refusal> {
  const now = deps.now ?? Date.now();
  const given = input.transactionHash ?? null;
  const postedAt = typeof input.postedAt === 'string' ? input.postedAt : '';
  const at = Date.parse(postedAt);
  if (typeof input.poster !== 'string' || !isAddress(input.poster, { strict: false }) || !Number.isFinite(at) || (given !== null && (typeof given !== 'string' || !isHash(given)))) {
    return { ok: false, status: 400, error: 'poster, postedAt and content are required, exactly as /api/briefs/board/call returned them in `record`; transactionHash is optional.' };
  }
  if (at < now - RECORD_WINDOW_MS || at > now + CLOCK_SKEW_MS) {
    return { ok: false, status: 409, error: 'This request was prepared more than a day ago, so it is not recorded. Prepare it again.' };
  }
  const read = parseBriefContent(input.content, now);
  if (!read.ok) return { ok: false, status: 400, error: read.error };
  if (!board) return { ok: false, status: 409, error: 'PokterBoard is not open yet.' };

  const poster = getAddress(input.poster);
  const signed = { ...read.content, poster, postedAt };
  const id = briefIdFor(briefMessage(signed));
  const existing = deps.store.get(id);
  if (existing?.board) return { ok: true, created: false, brief: existing };

  const hash = (given as Hex | null) ?? (await (deps.find ?? findBoardRequestTransaction)(board, { post: { poster, briefHash: requestBriefHash(signed) } }));
  if (!hash) {
    return {
      ok: false,
      status: 404,
      error: 'No post of this request is on PokterBoard yet. If the wallet asked for approval in the Binance App, approve it there, then ask again; or pass the transactionHash.',
    };
  }
  const sent = await (deps.read ?? readBoardTransaction)(hash);
  const reading = readBoardRequestTx({ request: { ...signed, board: null }, board, tx: { from: sent.from, to: sent.to, input: sent.input }, succeeded: sent.succeeded, logs: sent.logs });
  if (!reading.ok) return reading;
  if (reading.action !== 'post') return { ok: false, status: 409, error: 'The transaction is not a post of this request.' };
  const post = { requestId: reading.requestId, tx: hash, expiresAt: reading.expiresAt };

  /* The same text, signed on Pokter before: it was already public, and only gains the post. */
  if (existing) {
    deps.store.recordBoardPost(id, post);
    return { ok: true, created: false, brief: deps.store.get(id) ?? existing };
  }

  const targetProblem = await (deps.targetProblem ?? targetBuilderProblem)(read.content);
  if (targetProblem) return { ok: false, status: 409, error: `${targetProblem} The post stays on PokterBoard until it expires, and nothing was paid.` };

  const brief: Brief = {
    ...read.content,
    id,
    poster,
    signature: '0x',
    proof: 'board',
    state: 'open',
    postedAt,
    awardedBidId: null,
    board: { ...post, closedTx: null },
  };
  try {
    deps.store.add(brief);
  } catch (error) {
    /* Recorded by a second call at the same moment: the first one stands. */
    const prior = deps.store.get(id);
    if (prior) return { ok: true, created: false, brief: prior };
    throw error;
  }
  return { ok: true, created: true, brief: deps.store.get(id) ?? brief };
}
